using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

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
    private const ushort WAVE_FORMAT_PCM = 1;
    private const ushort VT_BLOB = 0x0041;
    private const uint PW_RENDERFULLCONTENT = 0x00000002;
    private const int ThumbMaxWidth = 280;
    private const int ThumbMaxHeight = 160;

    // Official IAudioClient IID (audioclient.h) — NOT 1CB9AD4D-756B-... which returns E_NOINTERFACE.
    private static readonly Guid IID_IAudioClient = new("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
    private static readonly Guid IID_IAudioCaptureClient = new("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
    private static readonly Guid IID_IMarshal = new("00000003-0000-0000-C000-000000000046");

    private static int Main(string[] args)
    {
        // ActivateAudioInterfaceAsync callbacks arrive on MTA; handler must be agile.
        var hrCo = CoInitializeEx(IntPtr.Zero, 0x0); // COINIT_MULTITHREADED
        if (hrCo < 0 && hrCo != unchecked((int)0x80010106)) // RPC_E_CHANGED_MODE
            Console.Error.WriteLine($"CoInitializeEx hr=0x{hrCo:X8}");

        if (args.Any(a => a == "--list-windows"))
        {
            try
            {
                ListWindows();
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex);
                return 1;
            }
        }

        if (args.Any(a => a == "--thumbnails"))
        {
            try
            {
                var hwnds = args
                    .SkipWhile(a => a != "--thumbnails")
                    .Skip(1)
                    .Select(a => long.TryParse(a, out var h) ? h : 0)
                    .Where(h => h > 0)
                    .ToArray();
                CaptureThumbnails(hwnds);
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex);
                return 1;
            }
        }

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
            Console.Error.WriteLine(
                "usage: luma-win-audio-host --list-windows | --thumbnails <hwnd...> | --pid <pid> | --hwnd <hwnd>");
            return 2;
        }

        try
        {
            Capture(pid);
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static void ListWindows()
    {
        var results = new List<object>();
        EnumWindows((hWnd, _) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            if (GetWindow(hWnd, 4) != IntPtr.Zero) return true;
            var len = GetWindowTextLengthW(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            _ = GetWindowTextW(hWnd, sb, sb.Capacity);
            var title = sb.ToString().Trim();
            if (string.IsNullOrWhiteSpace(title)) return true;
            if (title.Contains("Luma", StringComparison.OrdinalIgnoreCase)) return true;
            if (title.Equals("Program Manager", StringComparison.OrdinalIgnoreCase)) return true;
            if (IsCloaked(hWnd)) return true;

            GetWindowThreadProcessId(hWnd, out var wpid);
            if (wpid == 0) return true;
            string processName = "";
            try { processName = System.Diagnostics.Process.GetProcessById((int)wpid).ProcessName; }
            catch { /* exited */ }

            results.Add(new { hwnd = hWnd.ToInt64(), pid = wpid, title, processName });
            return true;
        }, IntPtr.Zero);

        Console.Out.Write(JsonSerializer.Serialize(results));
    }

    private static bool IsCloaked(IntPtr hWnd)
    {
        var hr = DwmGetWindowAttribute(hWnd, 14, out var cloaked, sizeof(int));
        return hr == 0 && cloaked != 0;
    }

    private static void CaptureThumbnails(long[] hwnds)
    {
        var map = new Dictionary<string, string?>();
        foreach (var hwndVal in hwnds)
        {
            var key = hwndVal.ToString();
            try
            {
                map[key] = CaptureThumbnailDataUrl((IntPtr)hwndVal);
            }
            catch
            {
                map[key] = null;
            }
        }
        Console.Out.Write(JsonSerializer.Serialize(map));
    }

    private static string? CaptureThumbnailDataUrl(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero || !IsWindow(hWnd)) return null;
        if (!GetWindowRect(hWnd, out var rect)) return null;
        var srcW = rect.Right - rect.Left;
        var srcH = rect.Bottom - rect.Top;
        if (srcW <= 1 || srcH <= 1) return null;

        using var full = new Bitmap(srcW, srcH, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(full))
        {
            var hdc = g.GetHdc();
            try
            {
                // PW_RENDERFULLCONTENT captures DWM/DirectComposition content (Edge, etc.).
                if (!PrintWindow(hWnd, hdc, PW_RENDERFULLCONTENT))
                    PrintWindow(hWnd, hdc, 0);
            }
            finally
            {
                g.ReleaseHdc(hdc);
            }
        }

        var scale = Math.Min((double)ThumbMaxWidth / srcW, (double)ThumbMaxHeight / srcH);
        scale = Math.Min(scale, 1.0);
        var dstW = Math.Max(1, (int)Math.Round(srcW * scale));
        var dstH = Math.Max(1, (int)Math.Round(srcH * scale));

        using var thumb = new Bitmap(dstW, dstH, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(thumb))
        {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(full, 0, 0, dstW, dstH);
        }

        using var ms = new MemoryStream();
        thumb.Save(ms, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
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

        var activationSize = Marshal.SizeOf<AUDIOCLIENT_ACTIVATION_PARAMS>();
        var activationPtr = Marshal.AllocHGlobal(activationSize);
        Marshal.StructureToPtr(activation, activationPtr, false);

        // Allocate PROPVARIANT in native memory so P/Invoke cannot reshape VT_BLOB.
        var propPtr = Marshal.AllocHGlobal(24);
        for (var i = 0; i < 24; i++) Marshal.WriteByte(propPtr, i, 0);
        Marshal.WriteInt16(propPtr, 0, (short)VT_BLOB);
        Marshal.WriteInt32(propPtr, 8, activationSize);
        Marshal.WriteIntPtr(propPtr, 16, activationPtr);

        IActivateAudioInterfaceAsyncOperation? asyncOp = null;
        try
        {
            var iid = IID_IAudioClient;
            var hr = ActivateAudioInterfaceAsync(
                "VAD\\Process_Loopback",
                ref iid,
                propPtr,
                handler,
                out asyncOp);
            Console.Error.WriteLine($"ActivateAudioInterfaceAsync hr=0x{hr:X8} pid={pid}");
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            if (WaitForSingleObject(activateEvent, 20000) != 0)
                throw new TimeoutException("ActivateAudioInterfaceAsync timed out");

            Console.Error.WriteLine($"activate result hr=0x{handler.ResultHr:X8} punk={(handler.AudioUnknown != IntPtr.Zero)}");
            if (handler.ResultHr < 0)
            {
                throw new COMException(
                    $"Process loopback activate failed for pid={pid}. Try another app window (e.g. browser playing audio).",
                    handler.ResultHr);
            }
            if (handler.AudioUnknown == IntPtr.Zero)
                throw new InvalidOperationException("Activate returned null IAudioClient");

            var audioClient = (IAudioClient)Marshal.GetTypedObjectForIUnknown(handler.AudioUnknown, typeof(IAudioClient));
            Marshal.Release(handler.AudioUnknown);
            handler.AudioUnknown = IntPtr.Zero;

            // Process-loopback clients do not implement GetMixFormat; use CD-quality PCM + AUTOCONVERTPCM
            // (matches Microsoft ApplicationLoopback sample).
            var fmt = new WAVEFORMATEX
            {
                wFormatTag = WAVE_FORMAT_PCM,
                nChannels = 2,
                nSamplesPerSec = 44100,
                wBitsPerSample = 16,
                nBlockAlign = 4,
                nAvgBytesPerSec = 176400,
                cbSize = 0,
            };

            hr = audioClient.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                0,
                0,
                ref fmt,
                IntPtr.Zero);
            Console.Error.WriteLine($"Initialize hr=0x{hr:X8}");
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            hr = audioClient.SetEventHandle(sampleEvent);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            var captureIid = IID_IAudioCaptureClient;
            hr = audioClient.GetService(ref captureIid, out var captureObj);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
            var capture = (IAudioCaptureClient)captureObj;

            hr = audioClient.Start();
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            Console.Error.WriteLine($"capturing pid={pid} format=s16le@44100x2");
            using var stdout = Console.OpenStandardOutput();
            var header = new byte[12];
            BitConverter.TryWriteBytes(header.AsSpan(0, 4), (uint)44100);
            BitConverter.TryWriteBytes(header.AsSpan(4, 2), (ushort)2);
            BitConverter.TryWriteBytes(header.AsSpan(6, 2), (ushort)16);
            stdout.Write(header);
            stdout.Flush();

            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

            _ = Task.Run(() =>
            {
                try
                {
                    while (!cts.IsCancellationRequested)
                    {
                        var line = Console.In.ReadLine();
                        if (line == null) break;
                        if (line.Trim().Equals("STOP", StringComparison.OrdinalIgnoreCase))
                        {
                            cts.Cancel();
                            break;
                        }
                    }
                }
                catch { /* ignore */ }
            }, cts.Token);

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
                        stdout.Write(BitConverter.GetBytes(bytes));
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
            if (asyncOp != null) Marshal.ReleaseComObject(asyncOp);
            if (propPtr != IntPtr.Zero) Marshal.FreeHGlobal(propPtr);
            if (activationPtr != IntPtr.Zero) Marshal.FreeHGlobal(activationPtr);
            if (activateEvent != IntPtr.Zero) CloseHandle(activateEvent);
            if (sampleEvent != IntPtr.Zero) CloseHandle(sampleEvent);
            handler.Dispose();
        }
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("ole32.dll")] private static extern int CoInitializeEx(IntPtr pvReserved, uint dwCoInit);
    [DllImport("ole32.dll")] private static extern int CoCreateFreeThreadedMarshaler(IntPtr punkOuter, out IntPtr ppunkMarshal);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextLengthW(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] private static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateEventW(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string? name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int ActivateAudioInterfaceAsync(
        [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
        ref Guid riid,
        IntPtr activationParams,
        [MarshalAs(UnmanagedType.Interface)] IActivateAudioInterfaceCompletionHandler completionHandler,
        out IActivateAudioInterfaceAsyncOperation activationOperation);

    // Marker interface — required so the CCW is agile across apartments.
    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAgileObject;

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, out IntPtr activatedInterface);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        [PreserveSig] int Initialize(uint shareMode, uint streamFlags, long hnsBufferDuration, long hnsPeriodicity, ref WAVEFORMATEX pFormat, IntPtr audioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint bufferSize);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(uint shareMode, IntPtr pFormat, out IntPtr closestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr deviceFormat);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint numFramesToRead, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint numFramesRead);
        [PreserveSig] int GetNextPacketSize(out uint numFramesInNextPacket);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
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

    [ComVisible(true)]
    [Guid("B8E3A6F2-4C1D-4E9A-9F3A-7D2C1B0A9E11")]
    [ClassInterface(ClassInterfaceType.None)]
    private sealed class ActivateHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject, ICustomQueryInterface, IDisposable
    {
        private readonly IntPtr _eventHandle;
        private IntPtr _ftm;
        public int ResultHr = unchecked((int)0x80004005);
        public IntPtr AudioUnknown;

        public ActivateHandler(IntPtr eventHandle)
        {
            _eventHandle = eventHandle;
            // Aggregate free-threaded marshaler so ActivateCompleted can run on MTA.
            var unk = Marshal.GetIUnknownForObject(this);
            try
            {
                var hr = CoCreateFreeThreadedMarshaler(unk, out _ftm);
                if (hr < 0)
                {
                    Console.Error.WriteLine($"CoCreateFreeThreadedMarshaler hr=0x{hr:X8}");
                    _ftm = IntPtr.Zero;
                }
            }
            finally
            {
                Marshal.Release(unk);
            }
        }

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            try
            {
                var hr = activateOperation.GetActivateResult(out ResultHr, out AudioUnknown);
                if (hr < 0 && ResultHr >= 0) ResultHr = hr;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"ActivateCompleted exception: {ex.Message}");
                ResultHr = unchecked((int)0x80004005);
                AudioUnknown = IntPtr.Zero;
            }
            finally
            {
                SetEvent(_eventHandle);
            }
            return 0;
        }

        public CustomQueryInterfaceResult GetInterface(ref Guid iid, out IntPtr ppv)
        {
            if (iid == IID_IMarshal && _ftm != IntPtr.Zero)
            {
                var hr = Marshal.QueryInterface(_ftm, in iid, out ppv);
                return hr >= 0 ? CustomQueryInterfaceResult.Handled : CustomQueryInterfaceResult.Failed;
            }
            ppv = IntPtr.Zero;
            return CustomQueryInterfaceResult.NotHandled;
        }

        public void Dispose()
        {
            if (_ftm != IntPtr.Zero)
            {
                Marshal.Release(_ftm);
                _ftm = IntPtr.Zero;
            }
        }

        [DllImport("kernel32.dll")] private static extern bool SetEvent(IntPtr hEvent);
    }
}
