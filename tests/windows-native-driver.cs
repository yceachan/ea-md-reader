using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
using System.Web.Script.Serialization;

public static class NativeDriver {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
  delegate bool EnumProc(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  static IntPtr Chooser(IntPtr owner) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((window, data) => {
      var title = new System.Text.StringBuilder(256); GetWindowText(window, title, title.Capacity);
      if (GetWindow(window, 4) == owner && title.ToString().StartsWith("选择打开 ")) { found = window; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  [STAThread]
  public static int Main(string[] args) {
    try {
      if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) throw new Exception("Cannot enable physical screen coordinates.");
      var window = new IntPtr(Int64.Parse(args[1]));
      object value;
      if (args[0].StartsWith("shell-")) {
        value = WindowsShellDriver.Run(args[0], window, Double.Parse(args[2], System.Globalization.CultureInfo.InvariantCulture), Double.Parse(args[3], System.Globalization.CultureInfo.InvariantCulture));
      } else if (args[0] == "hit") {
        double scale = GetDpiForWindow(window) / 96.0;
        var point = new Point { x = (int)Math.Round(Double.Parse(args[2], System.Globalization.CultureInfo.InvariantCulture) * scale), y = (int)Math.Round(Double.Parse(args[3], System.Globalization.CultureInfo.InvariantCulture) * scale) };
        if (!ClientToScreen(window, ref point)) throw new Exception("Cannot locate window.");
        IntPtr hit;
        if (SendMessageTimeout(window, 0x84, IntPtr.Zero, new IntPtr((point.y << 16) | (point.x & 0xffff)), 2, 5000, out hit) == IntPtr.Zero) throw new Exception("Hit test timed out.");
        value = new { hit = hit.ToInt64() };
      } else if (args[0] == "cancel" || args[0] == "select") {
        IntPtr chooser = IntPtr.Zero;
        for (int index = 0; index < 100 && chooser == IntPtr.Zero; index++) { chooser = Chooser(window); if (chooser == IntPtr.Zero) Thread.Sleep(100); }
        if (chooser == IntPtr.Zero) throw new Exception("Application chooser did not appear on test desktop.");
        var root = AutomationElement.FromHandle(chooser);
        string chosen = null;
        if (args[0] == "select") {
          var entry = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ListItem));
          if (entry == null) throw new Exception("No registered applications.");
          chosen = entry.Current.Name;
          // Native keyboard navigation sends the selection notification used by WinForms.
          var list = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.List));
          var listHandle = new IntPtr(list.Current.NativeWindowHandle);
          IntPtr selected;
          if (SendMessageTimeout(listHandle, 0x100, new IntPtr(0x24), IntPtr.Zero, 2, 5000, out selected) == IntPtr.Zero) throw new Exception("Cannot select registered application.");
          PostMessage(listHandle, 0x101, new IntPtr(0x24), IntPtr.Zero);
        }
        var button = root.FindFirst(TreeScope.Descendants, new PropertyCondition(AutomationElement.NameProperty, args[0] == "cancel" ? "取消" : "选择"));
        for (int index = 0; index < 100 && !button.Current.IsEnabled; index++) Thread.Sleep(100);
        ((InvokePattern)button.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
        value = new { chosen = chosen };
      } else if (args[0] == "maximize" || args[0] == "restore") {
        if (!PostMessage(window, 0x112, new IntPtr(args[0] == "maximize" ? 0xf030 : 0xf120), IntPtr.Zero)) throw new Exception("Native caption command failed.");
        value = new { sent = true };
      } else throw new Exception("Unknown driver action.");
      Console.OutputEncoding = new System.Text.UTF8Encoding(false);
      Console.WriteLine(new JavaScriptSerializer().Serialize(value)); return 0;
    } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
  }
}
