#requires -Version 7.0
param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class WindowsDeleteProbe {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  public static int Check(string path) {
    using (var handle = CreateFile(path, 0x10000, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero)) {
      return handle.IsInvalid ? Marshal.GetLastWin32Error() : 0;
    }
  }
}
'@
$paths = @((Get-Item -LiteralPath $Directory)) + @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
$blocked = @($paths | ForEach-Object {
  $code = [WindowsDeleteProbe]::Check($_.FullName)
  if ($code -ne 0) { @{ path = $_.FullName; directory = $_.PSIsContainer; error = $code } }
})
$processes = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Directory + '\', [StringComparison]::OrdinalIgnoreCase)
} | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine)
@{ time = [DateTime]::UtcNow.ToString('O'); blocked = $blocked; processes = $processes } | ConvertTo-Json -Depth 5
