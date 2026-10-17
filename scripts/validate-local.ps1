param([switch]$SkipBuild, [switch]$SkipRecovery)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
New-Item -ItemType Directory -Path 'var/local-validation' -Force | Out-Null

function Invoke-DockerChecked {
    param([string[]]$CommandArgs)
    if ($CommandArgs[0] -eq 'compose') {
        $CommandArgs = @('compose', '--project-directory', $workspace, '-f',
            (Join-Path $workspace 'docker/compose.services.yaml')) + $CommandArgs[1..($CommandArgs.Length-1)]
    }
    & docker @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker validation failed: docker $($CommandArgs -join ' ')"
    }
}

if (-not $SkipBuild) {
    Invoke-DockerChecked -CommandArgs @('compose','build','api','browser-check')
}
Invoke-DockerChecked -CommandArgs @('compose','up','-d','--no-build','--wait')
Invoke-DockerChecked -CommandArgs @('compose','exec','-T','gateway','nginx','-s','reload')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','tests')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','validate',
                      'python','-m','local_services.scenarios')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','validate')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','browser-check')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','browser-check',
                      'node','/qa/check-bank.cjs')
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','browser-check',
                      'node','/qa/check-victim.cjs')
if (-not $SkipRecovery) {
    Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','recovery-check')
}
Invoke-DockerChecked -CommandArgs @('compose','--profile','validation','run','--rm','--no-deps','validate',
                      'python','-m','local_services.collect_reports')
Invoke-DockerChecked -CommandArgs @('compose','cp','api:/data/validation/.','var/local-validation')
Write-Host 'Local validation passed. Open http://127.0.0.1:8080/inspector'
Write-Host 'Measured reports and screenshots: var/local-validation'
