using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;

// Real Shell interaction is restricted to a dedicated Windows 11 CI desktop.
public static class WindowsShellDriver {
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public uint size; public Rect monitor, work; public uint flags; }
  [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  delegate bool EnumProc(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  static List<IntPtr> ShellWindows() {
    var result = new List<IntPtr>();
    EnumWindows((window, data) => {
      if (!IsWindowVisible(window)) return true;
      uint pid; GetWindowThreadProcessId(window, out pid);
      try {
        string name = Process.GetProcessById((int)pid).ProcessName;
        if (name == "explorer" || name == "ShellExperienceHost") result.Add(window);
      } catch (ArgumentException) { }
      return true;
    }, IntPtr.Zero);
    return result;
  }
  public static object Run(string action, IntPtr window, double x, double y) {
    if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true" ||
        Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "self-hosted" ||
        Environment.GetEnvironmentVariable("EMD_DEDICATED_WINDOWS_DESKTOP") != "1")
      throw new Exception("Shell interaction requires a dedicated self-hosted CI desktop.");
    Point original; if (!GetCursorPos(out original)) throw new Exception("Cannot read CI cursor.");
    double scale = GetDpiForWindow(window) / 96.0;
    var point = new Point { x = (int)Math.Round(x * scale), y = (int)Math.Round(y * scale) };
    if (!ClientToScreen(window, ref point) || !SetForegroundWindow(window)) throw new Exception("Cannot activate the CI test window.");
    bool down = false;
    try {
      if (action == "shell-hover") {
        var before = new HashSet<IntPtr>(ShellWindows());
        if (!SetCursorPos(point.x, point.y)) throw new Exception("Cannot move CI pointer.");
        for (int attempt = 0; attempt < 60; attempt++) {
          Thread.Sleep(100);
          foreach (var handle in ShellWindows()) {
            if (before.Contains(handle)) continue;
            var root = AutomationElement.FromHandle(handle);
            var buttons = root.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
            // A native maximize tooltip has no layout-zone buttons.
            if (buttons.Count >= 3) return new { menu = true, zones = buttons.Count, name = root.Current.Name, className = root.Current.ClassName };
          }
        }
        throw new Exception("Windows 11 Snap Layouts did not appear on maximize hover. Enable Snap windows and hover layouts on the CI desktop.");
      }
      if (action == "shell-drag") {
        var info = new MonitorInfo { size = (uint)Marshal.SizeOf(typeof(MonitorInfo)) };
        if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) throw new Exception("Cannot read CI work area.");
        SetCursorPos(point.x, point.y); mouse_event(2, 0, 0, 0, UIntPtr.Zero); down = true;
        int endX = info.work.right - 1, endY = info.work.top + (info.work.bottom - info.work.top) / 2;
        for (int index = 1; index <= 30; index++) {
          SetCursorPos(point.x + (endX - point.x) * index / 30, point.y + (endY - point.y) * index / 30); Thread.Sleep(20);
        }
        Thread.Sleep(800); mouse_event(4, 0, 0, 0, UIntPtr.Zero); down = false;
        return new { dragged = true };
      }
      throw new Exception("Unknown Shell action.");
    } finally { if (down) mouse_event(4, 0, 0, 0, UIntPtr.Zero); SetCursorPos(original.x, original.y); }
  }
}
