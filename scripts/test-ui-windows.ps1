#requires -Version 7.0
param([Parameter(Mandatory = $true)][string]$CommandJson)
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class IsolatedDesktopTest {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct StartupInfo {
    public int size; public string reserved, desktop, title;
    public int x, y, width, height, xCount, yCount, fill, flags;
    public short show, reservedSize; public IntPtr reservedData, input, output, error;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct ProcessInfo { public IntPtr process, thread; public int processId, threadId; }
  [StructLayout(LayoutKind.Sequential)]
  struct JobLimits {
    public long processTime, jobTime; public uint flags;
    public UIntPtr minWorkingSet, maxWorkingSet; public uint processLimit;
    public UIntPtr affinity; public uint priority, scheduling;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct IoCounters { public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes; }
  [StructLayout(LayoutKind.Sequential)]
  struct ExtendedJobLimits {
    public JobLimits basic; public IoCounters io;
    public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, uint flags, uint access, IntPtr security);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder name, int length, out int needed);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CreateProcess(string app, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
    bool inherit, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedJobLimits limits, uint length);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

  static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static string Quote(string value) {
    var result = new StringBuilder("\"");
    int slashes = 0;
    foreach (char c in value) {
      if (c == '\\') { slashes++; continue; }
      result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
      result.Append(c); slashes = 0;
    }
    result.Append('\\', slashes * 2); return result.Append('"').ToString();
  }
  public static int Run(string[] command, string directory) {
    string name = "emd-test-" + Guid.NewGuid().ToString("N");
    IntPtr desktop = CreateDesktop(name, IntPtr.Zero, IntPtr.Zero, 0, 0x10000000, IntPtr.Zero);
    if (desktop == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
    IntPtr job = IntPtr.Zero, output = IntPtr.Zero, error = IntPtr.Zero;
    ProcessInfo process = new ProcessInfo();
    string previous = Environment.GetEnvironmentVariable("EMD_TEST_DESKTOP");
    try {
      job = CreateJobObject(IntPtr.Zero, null);
      Check(job != IntPtr.Zero);
      var limits = new ExtendedJobLimits(); limits.basic.flags = 0x2000; // Kill descendants on close.
      Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
      IntPtr current = GetCurrentProcess();
      Check(DuplicateHandle(current, GetStdHandle(-11), current, out output, 0, true, 2));
      Check(DuplicateHandle(current, GetStdHandle(-12), current, out error, 0, true, 2));
      var startup = new StartupInfo(); startup.size = Marshal.SizeOf(startup);
      var station = new StringBuilder(256); int needed;
      Check(GetUserObjectInformation(GetProcessWindowStation(), 2, station, station.Capacity * 2, out needed));
      startup.desktop = station.ToString() + "\\" + name; startup.flags = 0x100; startup.output = output; startup.error = error;
      var arguments = new StringBuilder();
      foreach (string argument in command) { if (arguments.Length > 0) arguments.Append(' '); arguments.Append(Quote(argument)); }
      Environment.SetEnvironmentVariable("EMD_TEST_DESKTOP", name);
      Console.WriteLine("Electron test desktop: " + startup.desktop + " (never activated)");
      Check(CreateProcess(command[0], arguments, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, directory, ref startup, out process));
      Check(AssignProcessToJobObject(job, process.process));
      if (ResumeThread(process.thread) == uint.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
      if (WaitForSingleObject(process.process, 600000) != 0) throw new TimeoutException("Isolated UI test exceeded ten minutes.");
      uint code; Check(GetExitCodeProcess(process.process, out code)); return (int)code;
    } finally {
      Environment.SetEnvironmentVariable("EMD_TEST_DESKTOP", previous);
      if (process.process != IntPtr.Zero) { TerminateProcess(process.process, 1); CloseHandle(process.process); }
      if (process.thread != IntPtr.Zero) CloseHandle(process.thread);
      if (job != IntPtr.Zero) CloseHandle(job);
      if (output != IntPtr.Zero) CloseHandle(output);
      if (error != IntPtr.Zero) CloseHandle(error);
      CloseDesktop(desktop);
    }
  }
}
'@
exit [IsolatedDesktopTest]::Run([string[]](ConvertFrom-Json $CommandJson), (Get-Location).Path)
