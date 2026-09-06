# Render installed Windows speech voices offline. The browser adds the PA filter.
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path $PSScriptRoot -Parent
$announcements = Get-Content -LiteralPath (Join-Path $projectRoot 'art/announcements.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.Rate = -1
    $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($entry in $announcements) {
        $speaker.SelectVoice($entry.voice)
        $speaker.SetOutputToWaveFile((Join-Path $projectRoot ('client/assets/' + $entry.file)), $format)
        $speaker.Speak($entry.text)
        $speaker.SetOutputToNull()
        Write-Output ('Rendered ' + $entry.file)
    }
} finally { $speaker.Dispose() }
