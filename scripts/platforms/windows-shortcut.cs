using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Emd {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  internal class ShellLink { }

  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, IntPtr findData, uint flags);
    void GetIDList(out IntPtr idList);
    void SetIDList(IntPtr idList);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder description, int length);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string description);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int length);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int length);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int command);
    void SetShowCmd(int command);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder icon, int length, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string icon, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
  }

  public static class WindowsShortcut {
    public static string Target(string path) {
      return Inspect(path)[0];
    }

    public static string[] Inspect(string path) {
      var link = (IShellLinkW)new ShellLink();
      try {
        ((IPersistFile)link).Load(path, 0);
        var target = new StringBuilder(32768);
        link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
        var directory = new StringBuilder(32768);
        link.GetWorkingDirectory(directory, directory.Capacity);
        var icon = new StringBuilder(32768);
        int index;
        link.GetIconLocation(icon, icon.Capacity, out index);
        return new[] { target.ToString(), directory.ToString(), icon.ToString() + "," + index };
      } finally { Marshal.FinalReleaseComObject(link); }
    }

    public static void Write(string path, string executable) {
      var link = (IShellLinkW)new ShellLink();
      try {
        link.SetPath(executable);
        link.SetWorkingDirectory(System.IO.Path.GetDirectoryName(executable));
        link.SetIconLocation(executable, 0);
        link.SetDescription("emd Markdown Reader");
        ((IPersistFile)link).Save(path, true);
      } finally { Marshal.FinalReleaseComObject(link); }
    }
  }
}
