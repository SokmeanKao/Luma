#include <napi.h>

Napi::Boolean IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  return exports;
}

NODE_API_MODULE(win_audio, Init)
