using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace Luma.WinAudioHost;

internal static class Program
{
    private const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    private const uint AUDCLNT_STREAMFLAGS_EVENTCALLBACK = 0x00040000;
    private const uint AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM = 0x80000000;
    private const uint AUDCLNT_SHAREMODE_SHARED = 0;
    private const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x2;
    private const uint AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1;
    private const int PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0;
    private const int WAVE_FORMAT_PCM = 1;
    private static readonly Guid IID_IAudioClient = new("1CB9AD4D-756B-4E23-C0A0-BC70B6F37964");
    private static readonly Guid IID_IAudioCaptureClient = new("C8ADBD64-E71E-48A0-A4DE-185C395CD317");

    private static int Main(string[] args)
    {
        uint pid = 0;
        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] == "--pid" && i + 1 < args.Length && uint.TryParse(args[i + 1], out pid))
                i++;
            else if (args[i] == "--hwnd" && i + 1 < args.Length && ulong.TryParse(args[i + 1], out var hwndVal))
            {
                GetWindowThreadProcessId((IntPtr)hwndVal, out pid);
                i++;
            }
        }

        if (pid == 0)
        {
            Console.Error.WriteLine("usage: luma-win-audio-host --pid <pid> | --hwnd <hwnd>");
            return 2;
        }

        try
        {
            Capture(pid);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.ToString());
            return 1;
        }
    }

    private static void Capture(uint pid)
    {
        var activateEvent = CreateEventW(IntPtr.Zero, false, false, null);
        var sampleEvent = CreateEventW(IntPtr.Zero, false, false, null);
        if (activateEvent == IntPtr.Zero || sampleEvent == IntPtr.Zero)
            throw new InvalidOperationException("CreateEvent failed");

        var handler = new ActivateHandler(activateEvent);
        var activation = new AUDIOCLIENT_ACTIVATION_PARAMS
        {
            ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            ProcessLoopbackParams = new AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
            {
                TargetProcessId = pid,
                ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
            },
        };

        var blob = StructToBytes(activation);
        var prop = new PROPVARIANT
        {
            vt = 0x0041, // VT_BLOB
            blob = new BLOB { cbSize = (uint)blob.Length, pBlobData = Marshal.AllocHGlobal(blob.Length) },
        };
        Marshal.Copy(blob, 0, prop.blob.pBlobData, blob.Length);

        try
        {
            var iid = IID_IAudioClient;
            var hr = ActivateAudioInterfaceAsync(
                "VAD\\Process_Loopback",
                ref iid,
                ref prop,
                handler,
                out var asyncOp);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            if (WaitForSingleObject(activateEvent, 15000) != 0)
                throw new TimeoutException("ActivateAudioInterfaceAsync timed out");

            if (handler.ResultHr < 0) Marshal.ThrowExceptionForHR(handler.ResultHr);
            if (handler.AudioClient == IntPtr.Zero)
                throw new InvalidOperationException("No IAudioClient");

            var audioClient = (IAudioClient)Marshal.GetObjectForIUnknown(handler.AudioClient);
            Marshal.Release(handler.AudioClient);

            var fmt = new WAVEFORMATEX
            {
                wFormatTag = WAVE_FORMAT_PCM,
                nChannels = 2,
                nSamplesPerSec = 48000,
                wBitsPerSample = 16,
                nBlockAlign = 4,
                nAvgBytesPerSec = 48000 * 4,
                cbSize = 0,
            };

            hr = audioClient.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                0,
                0,
                ref fmt,
                IntPtr.Zero);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            hr = audioClient.SetEventHandle(sampleEvent);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            hr = audioClient.GetService(IID_IAudioCaptureClient, out var captureUnk);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
            var capture = (IAudioCaptureClient)captureUnk;

            hr = audioClient.Start();
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            Console.Error.WriteLine($"capturing pid={pid} format=s16le@{fmt.nSamplesPerSec}x{fmt.nChannels}");
            using var stdout = Console.OpenStandardOutput();
            var header = new byte[12];
            BitConverter.TryWriteBytes(header.AsSpan(0, 4), fmt.nSamplesPerSec);
            BitConverter.TryWriteBytes(header.AsSpan(4, 2), fmt.nChannels);
            BitConverter.TryWriteBytes(header.AsSpan(6, 2), (ushort)16);
            // reserved u32
            stdout.Write(header);

            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };
            _ = Task.Run(() =>
            {
                try
                {
                    while (Console.In.Peek() != -1 || !cts.IsCancellationRequested)
                    {
                        var line = Console.In.ReadLine();
                        if (line != null && line.Trim().Equals("STOP", StringComparison.OrdinalIgnoreCase))
                        {
                            cts.Cancel();
                            break;
                        }
                    }
                }
                catch
                {
                    cts.Cancel();
                }
            });

            while (!cts.IsCancellationRequested)
            {
                var wait = WaitForSingleObject(sampleEvent, 200);
                if (wait != 0) continue;

                while (true)
                {
                    hr = capture.GetNextPacketSize(out var packet);
                    if (hr < 0 || packet == 0) break;
                    hr = capture.GetBuffer(out var data, out var frames, out var flags, out _, out _);
                    if (hr < 0) break;
                    var bytes = (int)frames * fmt.nBlockAlign;
                    if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 && data != IntPtr.Zero && bytes > 0)
                    {
                        var buf = new byte[bytes];
                        Marshal.Copy(data, buf, 0, bytes);
                        // frame: u32 length + pcm
                        var len = BitConverter.GetBytes(bytes);
                        stdout.Write(len);
                        stdout.Write(buf);
                        stdout.Flush();
                    }
                    capture.ReleaseBuffer(frames);
                }
            }

            audioClient.Stop();
        }
        finally
        {
            if (prop.blob.pBlobData != IntPtr.Zero) Marshal.FreeHGlobal(prop.blob.pBlobData);
            if (activateEvent != IntPtr.Zero) CloseHandle(activateEvent);
            if (sampleEvent != IntPtr.Zero) CloseHandle(sampleEvent);
        }
    }

    private static byte[] StructToBytes<T>(T value) where T : struct
    {
        var size = Marshal.SizeOf<T>();
        var ptr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(value, ptr, false);
            var bytes = new byte[size];
            Marshal.Copy(ptr, bytes, 0, size);
            return bytes;
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
    }

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateEventW(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        [In] ref Guid riid,
        [In] ref PROPVARIANT activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    [ComImport]
    [Guid("41D949AB-9862-444A-80F6-C261334DA5EB")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport]
    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, out IntPtr activatedInterface);
    }

    [ComImport]
    [Guid("1CB9AD4D-756B-4E23-C0A0-BC70B6F37964")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        int Initialize(uint shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, ref WAVEFORMATEX pFormat, IntPtr audioSessionGuid);
        int GetBufferSize(out uint bufferSize);
        int GetStreamLatency(out long latency);
        int GetCurrentPadding(out uint padding);
        int IsFormatSupported(uint shareMode, ref WAVEFORMATEX pFormat, out IntPtr closestMatch);
        int GetMixFormat(out IntPtr deviceFormat);
        int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr eventHandle);
        int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport]
    [Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        int GetBuffer(out IntPtr data, out uint numFramesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        int ReleaseBuffer(uint numFramesRead);
        int GetNextPacketSize(out uint numFramesInNextPacket);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS
    {
        public uint TargetProcessId;
        public int ProcessLoopbackMode;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public uint ActivationType;
        public AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BLOB
    {
        public uint cbSize;
        public IntPtr pBlobData;
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public BLOB blob;
    }

    [ComVisible(true)]
    [ClassInterface(ClassInterfaceType.None)]
    private sealed class ActivateHandler : IActivateAudioInterfaceCompletionHandler
    {
        private readonly IntPtr _eventHandle;
        public int ResultHr = unchecked((int)0x80004005);
        public IntPtr AudioClient;

        public ActivateHandler(IntPtr eventHandle) => _eventHandle = eventHandle;

        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            try
            {
                activateOperation.GetActivateResult(out ResultHr, out AudioClient);
            }
            catch (Exception)
            {
                ResultHr = unchecked((int)0x80004005);
                AudioClient = IntPtr.Zero;
            }
            finally
            {
                SetEvent(_eventHandle);
            }
        }

        [DllImport("kernel32.dll")]
        private static extern bool SetEvent(IntPtr hEvent);
    }
}
