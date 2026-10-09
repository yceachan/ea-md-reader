#requires -Version 7.0
param([string]$Directory)
$ErrorActionPreference = 'Stop'
$realUser = [Microsoft.Win32.Registry]::CurrentUser
$sandboxPath = 'Software\ea-md-reader-tests\' + [guid]::NewGuid().ToString('N')
$sandbox = $realUser.CreateSubKey($sandboxPath)
$registry = $sandbox
$integration = Join-Path $PSScriptRoot '..\scripts\platforms\windows-integration.ps1'
$executable = Join-Path $Directory '应用 空格\emd.exe'
[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($executable))
[IO.File]::WriteAllText($executable, 'fixture')
$shortcut = Join-Path $Directory 'emd.lnk'
$command = '"{0}" "%1"' -f $executable

function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Put([string]$Path, [string]$Name, [string]$Value) {
  $key = $registry.CreateSubKey($Path)
  try { $key.SetValue($Name, $Value) } finally { $key.Dispose() }
}
function Read([string]$Path, [string]$Name = '') {
  $key = $registry.OpenSubKey($Path)
  if ($null -eq $key) { return $null }
  try { return $key.GetValue($Name) } finally { $key.Dispose() }
}
function HasValue([string]$Path, [string]$Name) {
  $key = $registry.OpenSubKey($Path)
  if ($null -eq $key) { return $false }
  try { return $key.GetValueNames() -contains $Name } finally { $key.Dispose() }
}
function Snapshot([Microsoft.Win32.RegistryKey]$Key) {
  $values = @($Key.GetValueNames() | Sort-Object | ForEach-Object {
    @{ Name = $_; Kind = $Key.GetValueKind($_).ToString(); Value = $Key.GetValue($_, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  })
  $children = @($Key.GetSubKeyNames() | Sort-Object | ForEach-Object {
    $child = $Key.OpenSubKey($_)
    try { @{ Name = $_; Contents = (Snapshot $child) } } finally { $child.Dispose() }
  })
  return @{ Values = $values; Children = $children }
}
function RegistryJson {
  # COM may update its own Shell Extensions cache; compare all installer-related trees.
  $contents = @('Software\Classes', 'Software\yceachan', 'Software\RegisteredApplications',
    'Software\Microsoft\Windows\CurrentVersion\App Paths',
    'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts') | ForEach-Object {
    $key = $registry.OpenSubKey($_)
    try { @{ Path = $_; Contents = $(if ($null -ne $key) { Snapshot $key }) } }
    finally { if ($null -ne $key) { $key.Dispose() } }
  }
  return ($contents | ConvertTo-Json -Depth 100 -Compress)
}
function ExpectFailure([string]$Link) {
  $failed = $false
  try { & $integration install $executable $Link -Registry $sandbox } catch { $failed = $true }
  Assert $failed 'Integration should have failed'
}

try {
  Put 'Software\Classes\.md' '' 'foreign.Markdown'
  Put 'Software\Classes\.md\OpenWithProgids' 'foreign.Markdown' ''
  Put 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' 'ProgId' 'foreign.Markdown'
  $before = RegistryJson
  # Missing shortcut parent forces COM Save to fail after registry writes.
  ExpectFailure (Join-Path $Directory 'missing\emd.lnk')
  Assert ((RegistryJson) -eq $before) 'Fresh install failed to restore the registry'

  & $integration validate $executable $shortcut -Registry $sandbox
  & $integration install $executable $shortcut -Registry $sandbox
  Assert ((Read 'Software\Classes\Applications\emd.exe\shell\open\command') -eq $command) 'Wrong application command'
  Assert ((Read 'Software\Microsoft\Windows\CurrentVersion\App Paths\emd.exe') -eq $executable) 'Wrong App Paths entry'
  Assert ((Read 'Software\Classes\.md') -eq 'foreign.Markdown') 'Extension default changed'
  Assert ((Read 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' 'ProgId') -eq 'foreign.Markdown') 'UserChoice changed'
  Assert (HasValue 'Software\Classes\.html\OpenWithProgids' 'emd.HTML') 'HTML Open With missing'
  $key = $registry.OpenSubKey('Software\Classes\.md\OpenWithProgids')
  try { Assert ($key.GetValueKind('emd.Markdown') -eq [Microsoft.Win32.RegistryValueKind]::None) 'Open With must be REG_NONE' } finally { $key.Dispose() }
  $shell = New-Object -ComObject WScript.Shell
  $link = [Emd.WindowsShortcut]::Inspect($shortcut)
  Assert ($link[0] -eq $executable) 'Wrong shortcut target'
  Assert ($link[1] -eq [IO.Path]::GetDirectoryName($executable)) 'Wrong shortcut working directory'
  Assert ($link[2] -eq ($executable + ',0')) 'Wrong shortcut icon'
  Put 'Software\Classes\Applications\emd.exe' 'FriendlyAppName' 'custom name'
  $key = $registry.OpenSubKey('Software\Classes\Applications\emd.exe\SupportedTypes', $true)
  try { $key.SetValue('.md', '%UNCHANGED%', [Microsoft.Win32.RegistryValueKind]::ExpandString) } finally { $key.Dispose() }
  $beforeUpgrade = RegistryJson
  $beforeShortcut = [Convert]::ToBase64String([IO.File]::ReadAllBytes($shortcut))
  ExpectFailure (Join-Path $Directory 'missing\upgrade.lnk')
  Assert ((RegistryJson) -eq $beforeUpgrade) 'Upgrade failed to restore values and value kinds'
  Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($shortcut)) -eq $beforeShortcut) 'Upgrade changed the old shortcut'
  & $integration uninstall $executable $shortcut -Registry $sandbox
  & $integration uninstall $executable $shortcut -Registry $sandbox
  Assert (-not (Test-Path -LiteralPath $shortcut)) 'Shortcut was not removed'
  Assert ((Read 'Software\Classes\.md\OpenWithProgids' 'foreign.Markdown') -ne $null) 'Foreign Open With removed'
  Assert (-not (HasValue 'Software\Classes\.md\OpenWithProgids' 'emd.Markdown')) 'Owned Open With remains'

  & $integration install $executable $shortcut -Registry $sandbox
  Put 'Software\Classes\emd.HTML\shell\open\command' '' 'foreign command'
  $foreignLink = $shell.CreateShortcut($shortcut)
  $foreignLink.TargetPath = Join-Path $Directory 'foreign.exe'
  $foreignLink.Save()
  $foreignBytes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($shortcut))
  ExpectFailure $shortcut
  & $integration uninstall $executable $shortcut -Registry $sandbox
  Assert ((Read 'Software\Classes\emd.HTML\shell\open\command') -eq 'foreign command') 'Foreign registry command removed'
  Assert (HasValue 'Software\Classes\.html\OpenWithProgids' 'emd.HTML') 'Foreign class reference removed'
  Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($shortcut)) -eq $foreignBytes) 'Foreign shortcut changed'
  Assert ((Read 'Software\Classes\Applications\emd.exe\shell\open\command') -eq $null) 'Other owned registration was not removed'
  Write-Output 'Native HKCU isolation, Open With, shortcut, failure rollback and ownership checks passed.'
} finally {
  $sandbox.Dispose()
  $realUser.DeleteSubKeyTree($sandboxPath, $false)
}
