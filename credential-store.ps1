param([ValidateSet('encrypt','decrypt')][string]$Operation)
$ErrorActionPreference = 'Stop'
$value = [Console]::In.ReadToEnd()
if ($Operation -eq 'encrypt') {
    $secureValue = ConvertTo-SecureString -String $value -AsPlainText -Force
    [Console]::Write((ConvertFrom-SecureString -SecureString $secureValue))
} else {
    $secureValue = ConvertTo-SecureString -String $value
    $credential = New-Object System.Net.NetworkCredential('', $secureValue)
    [Console]::Write($credential.Password)
}
