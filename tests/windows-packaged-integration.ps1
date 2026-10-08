#requires -Version 7.0
param(
  [ValidateSet('validate', 'install', 'uninstall', 'cleanup')][string]$Action,
  [string]$Executable,
  [string]$Shortcut,
  [string]$Namespace
)
$ErrorActionPreference = 'Stop'
if ($Namespace -notmatch '^Software\\ea-md-reader-tests\\packaged-[0-9a-f]{32}$') { throw 'Invalid isolated registry namespace.' }
$user = [Microsoft.Win32.Registry]::CurrentUser
if ($Action -eq 'cleanup') {
  $user.DeleteSubKeyTree($Namespace, $false)
} else {
  $sandbox = $user.CreateSubKey($Namespace)
  try { & (Join-Path $PSScriptRoot '..\scripts\platforms\windows-integration.ps1') $Action $Executable $Shortcut -Registry $sandbox }
  finally { $sandbox.Dispose() }
}
