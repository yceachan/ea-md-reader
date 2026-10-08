#requires -Version 7.0
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('validate', 'install', 'uninstall')]
  [string]$Action,
  [Parameter(Mandatory = $true, Position = 1)]
  [string]$Executable,
  [Parameter(Mandatory = $true, Position = 2)]
  [string]$Shortcut,
  [Microsoft.Win32.RegistryKey]$Registry = [Microsoft.Win32.Registry]::CurrentUser
)

$ErrorActionPreference = 'Stop'
$capabilitiesPath = 'Software\yceachan\emd\Capabilities'
$registeredApplicationsPath = 'Software\RegisteredApplications'
$applicationPath = 'Software\Classes\Applications\emd.exe'
$markdownPath = 'Software\Classes\emd.Markdown'
$htmlPath = 'Software\Classes\emd.HTML'
$appPathsPath = 'Software\Microsoft\Windows\CurrentVersion\App Paths\emd.exe'
$command = '"{0}" "%1"' -f $Executable
$icon = '"{0}",0' -f $Executable
$changes = [System.Collections.Generic.List[object]]::new()
$createdKeys = [System.Collections.Generic.List[string]]::new()
$extensions = @{ 'emd.Markdown' = @('.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx'); 'emd.HTML' = @('.html', '.htm') }

function Set-RegistryValue([string]$Path, [string]$Name, $Value, [Microsoft.Win32.RegistryValueKind]$Kind = [Microsoft.Win32.RegistryValueKind]::String) {
  $previous = $registry.OpenSubKey($Path)
  $present = ($null -ne $previous) -and ($previous.GetValueNames() -contains $Name)
  try {
    $oldValue = $null
    $oldKind = $null
    if ($present) {
      $oldValue = $previous.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $oldKind = $previous.GetValueKind($Name)
    }
    $changes.Add(@{ Path = $Path; Name = $Name; Present = $present; Value = $oldValue; Kind = $oldKind })
  } finally { if ($null -ne $previous) { $previous.Dispose() } }
  $parent = ''
  foreach ($part in $Path.Split('\')) {
    $parent = $(if ($parent) { "$parent\$part" } else { $part })
    $existing = $registry.OpenSubKey($parent)
    if ($null -eq $existing) { if (-not $createdKeys.Contains($parent)) { $createdKeys.Add($parent) } }
    else { $existing.Dispose() }
  }
  $key = $registry.CreateSubKey($Path)
  try { $key.SetValue($Name, $Value, $Kind) }
  finally { $key.Dispose() }
}

function Restore-Registry {
  for ($index = $changes.Count - 1; $index -ge 0; $index--) {
    $change = $changes[$index]
    $key = $registry.OpenSubKey($change.Path, $true)
    if ($null -eq $key) { continue }
    try {
      if ($change.Present) { $key.SetValue($change.Name, $change.Value, $change.Kind) }
      else { $key.DeleteValue($change.Name, $false) }
    } finally { $key.Dispose() }
  }
  foreach ($path in ($createdKeys | Sort-Object Length -Descending)) {
    $key = $registry.OpenSubKey($path)
    if ($null -eq $key) { continue }
    try { $empty = ($key.ValueCount -eq 0) -and ($key.SubKeyCount -eq 0) }
    finally { $key.Dispose() }
    if ($empty) { $registry.DeleteSubKey($path, $false) }
  }
}

function Get-RegistryValue([string]$Path, [string]$Name) {
  $key = $registry.OpenSubKey($Path)
  if ($null -eq $key) { return $null }
  try { return $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  finally { $key.Dispose() }
}

function Remove-RegistryTree([string]$Path, [string]$ValuePath, [string]$ValueName, [string]$Expected) {
  if ((Get-RegistryValue $ValuePath $ValueName) -eq $Expected) {
    $registry.DeleteSubKeyTree($Path, $false)
  }
}

function Assert-RegistryValue([string]$Path, [string]$Name, [string]$Expected) {
  $value = Get-RegistryValue $Path $Name
  if (($null -ne $value) -and ($value -ne $Expected)) {
    throw "拒绝覆盖或删除其他应用的注册表项：$Path"
  }
}

if (-not ('Emd.WindowsShortcut' -as [type])) {
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-shortcut.cs')
}
$ownsShortcut = $false
if (Test-Path -LiteralPath $Shortcut) {
  try {
    $existing = [Emd.WindowsShortcut]::Target($Shortcut)
    $expectedPath = [System.IO.Path]::GetFullPath($Executable)
    $existingPath = [System.IO.Path]::GetFullPath($existing)
    $ownsShortcut = [System.StringComparer]::OrdinalIgnoreCase.Equals($existingPath, $expectedPath)
  } catch { if ($Action -ne 'uninstall') { throw } }
  if (($Action -ne 'uninstall') -and -not $ownsShortcut) {
    throw "拒绝覆盖或删除其他快捷方式：$Shortcut"
  }
}
if ($Action -ne 'uninstall') {
  Assert-RegistryValue "$applicationPath\shell\open\command" '' $command
  Assert-RegistryValue $capabilitiesPath 'ApplicationIcon' $icon
  Assert-RegistryValue "$markdownPath\shell\open\command" '' $command
  Assert-RegistryValue "$htmlPath\shell\open\command" '' $command
  Assert-RegistryValue $appPathsPath '' $Executable
  Assert-RegistryValue $registeredApplicationsPath 'emd' $capabilitiesPath
}

if ($Action -eq 'validate') { exit 0 }

if ($Action -eq 'install') {
  $shortcutBytes = $(if ($ownsShortcut) { [System.IO.File]::ReadAllBytes($Shortcut) })
  try {
    Set-RegistryValue "$applicationPath\shell\open\command" '' $command
    Set-RegistryValue $applicationPath 'FriendlyAppName' 'emd'
    Set-RegistryValue "$applicationPath\DefaultIcon" '' $icon
    foreach ($extension in @('.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx', '.html', '.htm')) {
      Set-RegistryValue "$applicationPath\SupportedTypes" $extension ''
    }
    Set-RegistryValue $capabilitiesPath 'ApplicationIcon' $icon
    Set-RegistryValue $capabilitiesPath 'ApplicationName' 'emd'
    Set-RegistryValue $capabilitiesPath 'ApplicationDescription' 'Read-only Markdown and self-contained HTML reader'
    foreach ($extension in @('.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx')) {
      Set-RegistryValue "$capabilitiesPath\FileAssociations" $extension 'emd.Markdown'
    }
    foreach ($extension in @('.html', '.htm')) {
      Set-RegistryValue "$capabilitiesPath\FileAssociations" $extension 'emd.HTML'
    }
    Set-RegistryValue $registeredApplicationsPath 'emd' $capabilitiesPath
    Set-RegistryValue "$markdownPath\shell\open\command" '' $command
    Set-RegistryValue $markdownPath '' 'Markdown document'
    Set-RegistryValue "$markdownPath\DefaultIcon" '' $icon
    Set-RegistryValue "$htmlPath\shell\open\command" '' $command
    Set-RegistryValue $htmlPath '' 'HTML document'
    Set-RegistryValue "$htmlPath\DefaultIcon" '' $icon
    Set-RegistryValue $appPathsPath '' $Executable
    Set-RegistryValue $appPathsPath 'Path' ([System.IO.Path]::GetDirectoryName($Executable))
    foreach ($class in $extensions.Keys) {
      foreach ($extension in $extensions[$class]) {
        Set-RegistryValue "Software\Classes\$extension\OpenWithProgids" $class ([byte[]]@()) ([Microsoft.Win32.RegistryValueKind]::None)
      }
    }

    [Emd.WindowsShortcut]::Write($Shortcut, $Executable)
  } catch {
    $failure = $_
    try {
      Restore-Registry
      if ($ownsShortcut) { [System.IO.File]::WriteAllBytes($Shortcut, $shortcutBytes) }
      elseif (Test-Path -LiteralPath $Shortcut -PathType Leaf) { Remove-Item -LiteralPath $Shortcut -Force }
    } catch { throw "安装集成失败：$failure；恢复注册表或快捷方式失败：$_" }
    throw $failure
  }
  exit 0
}

if ($ownsShortcut) { Remove-Item -LiteralPath $Shortcut -Force }
foreach ($class in $extensions.Keys) {
  if ((Get-RegistryValue "Software\Classes\$class\shell\open\command" '') -eq $command) {
    foreach ($extension in $extensions[$class]) {
      $key = $registry.OpenSubKey("Software\Classes\$extension\OpenWithProgids", $true)
      if ($null -ne $key) {
        try { $key.DeleteValue($class, $false) }
        finally { $key.Dispose() }
      }
    }
  }
}
Remove-RegistryTree $applicationPath "$applicationPath\shell\open\command" '' $command
Remove-RegistryTree $markdownPath "$markdownPath\shell\open\command" '' $command
Remove-RegistryTree $htmlPath "$htmlPath\shell\open\command" '' $command
Remove-RegistryTree $appPathsPath $appPathsPath '' $Executable
if (((Get-RegistryValue $registeredApplicationsPath 'emd') -eq $capabilitiesPath) -and ((Get-RegistryValue $capabilitiesPath 'ApplicationIcon') -eq $icon)) {
  $key = $registry.OpenSubKey($registeredApplicationsPath, $true)
  try { $key.DeleteValue('emd', $false) }
  finally { $key.Dispose() }
}
Remove-RegistryTree 'Software\yceachan\emd' $capabilitiesPath 'ApplicationIcon' $icon
