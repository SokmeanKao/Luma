#include <napi.h>

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <windows.h>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "mmdevapi.lib")

namespace {

struct PcmMeta {
  uint32_t sampleRate;
  uint32_t channels;
};

class CompletionHandler;

class CaptureEngine {
 public:
  CaptureEngine() = default;
  ~CaptureEngine() { Stop(); }

  bool IsCapturing() const { return capturing_.load(); }

  HRESULT Start(DWORD pid, bool includeTree,
                std::shared_ptr<Napi::ThreadSafeFunction> pcmTsfn,
                std::shared_ptr<Napi::ThreadSafeFunction> endedTsfn) {
    Stop();
    pcmTsfn_ = std::move(pcmTsfn);
    endedTsfn_ = std::move(endedTsfn);
    includeTree_ = includeTree;
    targetPid_ = pid;
    stop_.store(false);
    capturing_.store(false);

    HRESULT hr = Activate(pid, includeTree);
    if (FAILED(hr)) return hr;

    capturing_.store(true);
    thread_ = std::thread([this] { CaptureLoop(); });
    return S_OK;
  }

  void Stop() {
    stop_.store(true);
    if (sampleEvent_) SetEvent(sampleEvent_);
    if (thread_.joinable()) thread_.join();
    ReleaseClient();
    capturing_.store(false);
    pcmTsfn_.reset();
    if (endedTsfn_) {
      endedTsfn_->NonBlockingCall([](Napi::Env, Napi::Function js) { js.Call({}); });
      endedTsfn_->Release();
      endedTsfn_.reset();
    }
  }

 private:
  friend class CompletionHandler;

  HRESULT Activate(DWORD pid, bool includeTree);
  void CaptureLoop();
  void ReleaseClient();
  void EmitPcm(const BYTE* data, UINT32 frames, const WAVEFORMATEX& fmt);

  std::atomic<bool> stop_{false};
  std::atomic<bool> capturing_{false};
  DWORD targetPid_ = 0;
  bool includeTree_ = true;

  HANDLE sampleEvent_ = nullptr;
  HANDLE activateEvent_ = nullptr;
  HRESULT activateHr_ = E_FAIL;

  IAudioClient* audioClient_ = nullptr;
  IAudioCaptureClient* captureClient_ = nullptr;
  WAVEFORMATEX captureFormat_{};
  CompletionHandler* handler_ = nullptr;

  std::thread thread_;
  std::shared_ptr<Napi::ThreadSafeFunction> pcmTsfn_;
  std::shared_ptr<Napi::ThreadSafeFunction> endedTsfn_;
  std::mutex mu_;
};

class CompletionHandler : public IActivateAudioInterfaceCompletionHandler {
 public:
  explicit CompletionHandler(CaptureEngine* engine) : engine_(engine) {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override { return ++ref_; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG n = --ref_;
    if (n == 0) delete this;
    return n;
  }

  HRESULT STDMETHODCALLTYPE ActivateCompleted(
      IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT hrActivate = E_FAIL;
    IUnknown* unk = nullptr;
    HRESULT hr = operation->GetActivateResult(&hrActivate, &unk);
    if (FAILED(hr) || FAILED(hrActivate) || !unk) {
      engine_->activateHr_ = FAILED(hr) ? hr : hrActivate;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }

    IAudioClient* client = nullptr;
    hr = unk->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&client));
    unk->Release();
    if (FAILED(hr) || !client) {
      engine_->activateHr_ = hr;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }

    WAVEFORMATEX fmt = {};
    fmt.wFormatTag = WAVE_FORMAT_PCM;
    fmt.nChannels = 2;
    fmt.nSamplesPerSec = 48000;
    fmt.wBitsPerSample = 16;
    fmt.nBlockAlign = fmt.nChannels * fmt.wBitsPerSample / 8;
    fmt.nAvgBytesPerSec = fmt.nSamplesPerSec * fmt.nBlockAlign;

    hr = client->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
            AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        0, 0, &fmt, nullptr);
    if (FAILED(hr)) {
      client->Release();
      engine_->activateHr_ = hr;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }

    engine_->sampleEvent_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!engine_->sampleEvent_) {
      client->Release();
      engine_->activateHr_ = E_FAIL;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }
    hr = client->SetEventHandle(engine_->sampleEvent_);
    if (FAILED(hr)) {
      client->Release();
      engine_->activateHr_ = hr;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }

    IAudioCaptureClient* capture = nullptr;
    hr = client->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(&capture));
    if (FAILED(hr) || !capture) {
      client->Release();
      engine_->activateHr_ = hr;
      SetEvent(engine_->activateEvent_);
      return S_OK;
    }

    engine_->audioClient_ = client;
    engine_->captureClient_ = capture;
    engine_->captureFormat_ = fmt;
    engine_->activateHr_ = S_OK;
    SetEvent(engine_->activateEvent_);
    return S_OK;
  }

 private:
  CaptureEngine* engine_;
  std::atomic<ULONG> ref_{1};
};

HRESULT CaptureEngine::Activate(DWORD pid, bool includeTree) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool coInited = SUCCEEDED(hr) || hr == S_FALSE || hr == RPC_E_CHANGED_MODE;
  if (!coInited) return hr;

  activateEvent_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!activateEvent_) return E_FAIL;

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      includeTree ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
                  : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activateParams = {};
  activateParams.vt = VT_BLOB;
  activateParams.blob.cbSize = sizeof(params);
  activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  handler_ = new CompletionHandler(this);
  IActivateAudioInterfaceAsyncOperation* asyncOp = nullptr;
  hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &activateParams, handler_,
      &asyncOp);
  if (FAILED(hr)) {
    handler_->Release();
    handler_ = nullptr;
    return hr;
  }

  WaitForSingleObject(activateEvent_, 15000);
  if (asyncOp) asyncOp->Release();
  handler_->Release();
  handler_ = nullptr;

  if (FAILED(activateHr_) || !audioClient_ || !captureClient_) {
    ReleaseClient();
    return FAILED(activateHr_) ? activateHr_ : E_FAIL;
  }

  hr = audioClient_->Start();
  if (FAILED(hr)) {
    ReleaseClient();
    return hr;
  }
  return S_OK;
}

void CaptureEngine::EmitPcm(const BYTE* data, UINT32 frames, const WAVEFORMATEX& fmt) {
  if (!pcmTsfn_ || !data || frames == 0) return;
  const size_t bytes = static_cast<size_t>(frames) * fmt.nBlockAlign;
  auto buf = std::make_shared<std::vector<uint8_t>>(data, data + bytes);
  PcmMeta meta{fmt.nSamplesPerSec, fmt.nChannels};
  pcmTsfn_->NonBlockingCall([buf, meta](Napi::Env env, Napi::Function js) {
    auto ab = Napi::ArrayBuffer::New(env, buf->size());
    memcpy(ab.Data(), buf->data(), buf->size());
    auto u8 = Napi::Uint8Array::New(env, buf->size(), ab, 0);
    auto obj = Napi::Object::New(env);
    obj.Set("sampleRate", Napi::Number::New(env, meta.sampleRate));
    obj.Set("channels", Napi::Number::New(env, meta.channels));
    js.Call({u8, obj});
  });
}

void CaptureEngine::CaptureLoop() {
  while (!stop_.load()) {
    DWORD wait = WaitForSingleObject(sampleEvent_, 200);
    if (stop_.load()) break;
    if (wait != WAIT_OBJECT_0) continue;

    if (!captureClient_) break;
    UINT32 packet = 0;
    while (SUCCEEDED(captureClient_->GetNextPacketSize(&packet)) && packet > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      HRESULT hr = captureClient_->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;
      if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data && frames > 0) {
        EmitPcm(data, frames, captureFormat_);
      }
      captureClient_->ReleaseBuffer(frames);
    }
  }
  if (audioClient_) audioClient_->Stop();
}

void CaptureEngine::ReleaseClient() {
  if (captureClient_) {
    captureClient_->Release();
    captureClient_ = nullptr;
  }
  if (audioClient_) {
    audioClient_->Release();
    audioClient_ = nullptr;
  }
  if (sampleEvent_) {
    CloseHandle(sampleEvent_);
    sampleEvent_ = nullptr;
  }
  if (activateEvent_) {
    CloseHandle(activateEvent_);
    activateEvent_ = nullptr;
  }
}

CaptureEngine g_engine;
std::shared_ptr<Napi::ThreadSafeFunction> g_pcmTsfn;
std::shared_ptr<Napi::ThreadSafeFunction> g_endedTsfn;

bool OsSupportsProcessLoopback() {
  OSVERSIONINFOEXW vi = {};
  vi.dwOSVersionInfoSize = sizeof(vi);
  // Build 20348+ required per MS docs; use RtlGetVersion when available.
  using RtlGetVersionFn = LONG(WINAPI*)(PRTL_OSVERSIONINFOW);
  HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
  if (!ntdll) return false;
  auto rtl = reinterpret_cast<RtlGetVersionFn>(GetProcAddress(ntdll, "RtlGetVersion"));
  if (!rtl) return false;
  RTL_OSVERSIONINFOW info = {};
  info.dwOSVersionInfoSize = sizeof(info);
  if (rtl(&info) != 0) return false;
  return info.dwBuildNumber >= 20348;
}

Napi::Boolean IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), OsSupportsProcessLoopback());
}

Napi::Number HwndToPid(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "hwnd required").ThrowAsJavaScriptException();
    return Napi::Number::New(env, 0);
  }
  HWND hwnd = reinterpret_cast<HWND>(
      static_cast<uintptr_t>(info[0].As<Napi::Number>().Int64Value()));
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  return Napi::Number::New(env, pid);
}

void StartProcessLoopback(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!OsSupportsProcessLoopback()) {
    Napi::Error::New(env, "Process loopback requires Windows build 20348+")
        .ThrowAsJavaScriptException();
    return;
  }
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "options object required").ThrowAsJavaScriptException();
    return;
  }
  auto opts = info[0].As<Napi::Object>();
  DWORD pid = opts.Get("pid").As<Napi::Number>().Uint32Value();
  bool includeTree = true;
  if (opts.Has("includeProcessTree")) {
    includeTree = opts.Get("includeProcessTree").As<Napi::Boolean>().Value();
  }
  if (pid == 0) {
    Napi::Error::New(env, "invalid pid").ThrowAsJavaScriptException();
    return;
  }

  if (!g_pcmTsfn) {
    Napi::Error::New(env, "call onPcm before startProcessLoopback").ThrowAsJavaScriptException();
    return;
  }

  HRESULT hr = g_engine.Start(pid, includeTree, g_pcmTsfn, g_endedTsfn);
  if (FAILED(hr)) {
    char msg[128];
    snprintf(msg, sizeof(msg), "startProcessLoopback failed HRESULT=0x%08lX",
             static_cast<unsigned long>(hr));
    Napi::Error::New(env, msg).ThrowAsJavaScriptException();
  }
}

void StopCapture(const Napi::CallbackInfo& info) {
  g_engine.Stop();
}

Napi::Function OnPcm(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "callback required").ThrowAsJavaScriptException();
    return Napi::Function::New(env, [](const Napi::CallbackInfo&) {});
  }
  if (g_pcmTsfn) {
    g_pcmTsfn->Release();
    g_pcmTsfn.reset();
  }
  g_pcmTsfn = std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "luma-win-audio-pcm", 0, 1));
  return Napi::Function::New(env, [](const Napi::CallbackInfo&) {
    if (g_pcmTsfn) {
      g_pcmTsfn->Release();
      g_pcmTsfn.reset();
    }
  });
}

Napi::Function OnEnded(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "callback required").ThrowAsJavaScriptException();
    return Napi::Function::New(env, [](const Napi::CallbackInfo&) {});
  }
  if (g_endedTsfn) {
    g_endedTsfn->Release();
    g_endedTsfn.reset();
  }
  g_endedTsfn = std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(
      env, info[0].As<Napi::Function>(), "luma-win-audio-ended", 0, 1));
  return Napi::Function::New(env, [](const Napi::CallbackInfo&) {
    if (g_endedTsfn) {
      g_endedTsfn->Release();
      g_endedTsfn.reset();
    }
  });
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("hwndToPid", Napi::Function::New(env, HwndToPid));
  exports.Set("startProcessLoopback", Napi::Function::New(env, StartProcessLoopback));
  exports.Set("stop", Napi::Function::New(env, StopCapture));
  exports.Set("onPcm", Napi::Function::New(env, OnPcm));
  exports.Set("onEnded", Napi::Function::New(env, OnEnded));
  return exports;
}

}  // namespace

NODE_API_MODULE(win_audio, Init)
