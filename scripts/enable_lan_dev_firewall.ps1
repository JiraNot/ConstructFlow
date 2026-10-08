param(
  [string]$InterfaceAlias = 'Wi-Fi',
  [int]$Port = 5183
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an elevated PowerShell window (Run as Administrator).'
}

$profiles = @(Get-NetConnectionProfile -InterfaceAlias $InterfaceAlias -ErrorAction Stop)
if ($profiles.Count -eq 0) {
  throw "No network profile found for interface '$InterfaceAlias'. Pass the active home Wi-Fi interface with -InterfaceAlias."
}
foreach ($profile in $profiles) {
  if ($profile.NetworkCategory -ne 'Private') {
    Set-NetConnectionProfile -InterfaceIndex $profile.InterfaceIndex -NetworkCategory Private
  }
}

$ruleName = 'ConstructFlow Plan Editor LAN Development (TCP 5183)'
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress LocalSubnet `
  -Profile Private | Out-Null

Write-Host "Allowed TCP $Port from the local subnet on the Private profile."
Write-Host 'Start the app with npm run dev:standalone; use the Network URL printed by Vite.'
