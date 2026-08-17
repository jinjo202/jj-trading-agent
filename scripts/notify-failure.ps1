# Posts the tail of a failed run's log to ntfy.sh (keyless push, no account/API key).
# Kept as a separate .ps1 rather than inlined in daily.cmd: cmd.exe's block
# parser gets confused by parentheses inside an `if ( ... )` body even when
# they're inside quoted PowerShell code, so embedding this there breaks the
# .cmd file outright ("the was unexpected at this time"). A plain -File call
# avoids that boundary entirely.
param(
    [Parameter(Mandatory)] [string]$LogPath,
    [Parameter(Mandatory)] [string]$Topic,
    [Parameter(Mandatory)] [string]$Title
)

$tail = (Get-Content $LogPath -Tail 25 -Encoding UTF8) -join [Environment]::NewLine
$tmpFile = [System.IO.Path]::GetTempFileName()
try {
    # Write via .NET, not Out-File/Set-Content -- those default to the system
    # ANSI codepage on Windows PowerShell 5.1 and mangle Korean text.
    [System.IO.File]::WriteAllText($tmpFile, $tail, (New-Object System.Text.UTF8Encoding($false)))
    # curl.exe, not Invoke-RestMethod -- WinPS 5.1 reinterprets byte-array
    # request bodies through the system codepage before re-encoding, which
    # corrupts non-ASCII bytes. curl sends the file's bytes as-is.
    & curl.exe -s -m 15 -X POST "https://ntfy.sh/$Topic" -H "Title: $Title" -H "Priority: high" --data-binary "@$tmpFile" | Out-Null
} finally {
    Remove-Item $tmpFile -ErrorAction SilentlyContinue
}
