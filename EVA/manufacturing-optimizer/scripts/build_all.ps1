$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& "$here\1_build_api.ps1"
& "$here\2_build_installer.ps1"
