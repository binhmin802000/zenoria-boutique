<#
.SYNOPSIS
    Sauvegarde du projet Zenoria : code, medias du stockage, originaux, documents et notes de reglages.

.DESCRIPTION
    Ce script cree un dossier date dans C:\Sauvegardes-Zenoria (par defaut) et y range :
      - code\         le depot Git complet (bundle) et un ZIP des fichiers
      - base\         les scripts SQL du projet, la requete d'export de la base et les donnees visibles par les visiteurs
      - medias\       les photos et videos envoyees depuis l'administration (Supabase Storage)
      - originaux\    vos photos et videos d'origine (si -Originaux est indique)
      - documents\    vos documents (si -Documents est indique)
      - reglages\     un modele a completer pour les reglages de Vercel, Supabase et Resend

    Le script NE SUPPRIME RIEN et NE MODIFIE RIEN dans votre projet. Les seules actions sur le depot Git sont :
      - la creation d'une etiquette (tag) locale, pour marquer l'etat sauvegarde ;
      - un commit, seulement si vous ajoutez -Commit ;
      - un envoi vers GitHub, seulement si vous ajoutez -Pousser.

    L'export de la base de donnees ne peut pas etre automatise ici : il se fait dans le navigateur
    (Supabase > SQL Editor). Le script prepare la requete et la copie dans le presse-papiers.

    Aucun secret n'est copie : le fichier .env.local n'est jamais recopie, seuls les NOMS de ses variables sont notes.

    Note : les messages de ce script sont volontairement ecrits sans accents, pour qu'ils s'affichent
    correctement quel que soit l'editeur ou le terminal utilise. Fonctionne sous Windows (PowerShell 5.1 ou plus recent).

.PARAMETER Projet
    Dossier du projet (celui qui contient package.json et .git). Par defaut : le dossier courant.

.PARAMETER Destination
    Dossier ou ecrire les sauvegardes. Par defaut : C:\Sauvegardes-Zenoria

.PARAMETER Originaux
    Dossier de vos photos et videos d'origine a copier (par exemple C:\Users\RH5514\Downloads\Bagues).

.PARAMETER Documents
    Dossier de documents a copier (logos, textes, roadmap...).

.PARAMETER ScriptsSql
    Dossier ou se trouvent vos fichiers supabase_*.sql, s'ils ne sont pas dans le projet.

.PARAMETER SeulementVerifier
    Verifie les prerequis et affiche ce qui serait sauvegarde. Ne cree et n'ecrit rien.

.PARAMETER SansMedias
    Ne telecharge pas les photos et videos du stockage.

.PARAMETER SansZip
    Ne cree pas l'archive ZIP finale.

.PARAMETER Commit
    Enregistre d'abord les modifications en cours dans Git (git add . puis git commit).

.PARAMETER Pousser
    Envoie ensuite le code et l'etiquette vers GitHub (git push).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\sauvegarde-zenoria.ps1 -SeulementVerifier

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\sauvegarde-zenoria.ps1 -Originaux "C:\Users\RH5514\Downloads\Bagues" -Commit -Pousser
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Projet = '',
    [string]$Destination = 'C:\Sauvegardes-Zenoria',
    [string]$Originaux = '',
    [string]$Documents = '',
    [string]$ScriptsSql = '',
    [switch]$SeulementVerifier,
    [switch]$SansMedias,
    [switch]$SansZip,
    [switch]$Commit,
    [switch]$Pousser
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# ----------------------------------------------------------------------------
# Etat partage entre les etapes
# ----------------------------------------------------------------------------
$script:Journal = New-Object System.Collections.Generic.List[string]
$script:Resultats = New-Object System.Collections.Generic.List[object]
$script:AFaire = New-Object System.Collections.Generic.List[string]
$script:NbWarn = 0
$script:NbErr = 0
$script:Bloquant = $false
$script:Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:ProjetPath = ''
$script:Branche = ''
$script:CommitCourt = ''
$script:NbModifs = 0
$script:EnvPath = ''
$script:EnvExpose = $false
$script:SbUrl = ''
$script:SbKey = ''
$script:SbOk = $false
$script:DestRacine = ''
$script:Dest = ''
$script:Tag = ''
$script:BundlePath = ''
$script:ZipPath = ''
$script:DonneesLues = $false
$script:Produits = @()
$script:SiteMedia = @()
$script:ProduitsTexte = ''
$script:SiteMediaTexte = ''
$script:PromoTexte = ''

# ----------------------------------------------------------------------------
# Outils generaux
# ----------------------------------------------------------------------------
function Say {
    param([string]$Level, [string]$Text)
    $prefix = '        '
    $color = 'Gray'
    if ($Level -eq 'OK') { $prefix = '[OK]     '; $color = 'Green' }
    if ($Level -eq 'WARN') { $prefix = '[ATTENTION] '; $color = 'Yellow'; $script:NbWarn++ }
    if ($Level -eq 'ERR') { $prefix = '[ERREUR] '; $color = 'Red'; $script:NbErr++ }
    if ($Level -eq 'STEP') { $prefix = ''; $color = 'Cyan'; Write-Host '' }
    Write-Host ($prefix + $Text) -ForegroundColor $color
    $script:Journal.Add(((Get-Date -Format 'HH:mm:ss') + ' ' + $prefix + $Text))
}

function Add-Resultat {
    param([string]$Etape, [string]$Statut, [string]$Detail)
    $script:Resultats.Add([pscustomobject]@{ Etape = $Etape; Statut = $Statut; Detail = $Detail })
}

function Format-Taille {
    param([double]$Octets)
    if ($Octets -ge 1GB) { return ('{0:N2} Go' -f ($Octets / 1GB)) }
    if ($Octets -ge 1MB) { return ('{0:N1} Mo' -f ($Octets / 1MB)) }
    if ($Octets -ge 1KB) { return ('{0:N0} Ko' -f ($Octets / 1KB)) }
    return ('{0:N0} octets' -f $Octets)
}

function Get-AbsolutePath {
    param([string]$Path)
    if ([System.IO.Path]::IsPathRooted($Path)) { return $Path.TrimEnd('\') }
    return (Join-Path (Get-Location).Path $Path).TrimEnd('\')
}

function Write-TextFile {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, $script:Utf8)
}

function Get-DirInfo {
    param([string]$Path)
    $m = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum
    $count = 0
    $sum = [int64]0
    if ($null -ne $m) {
        $count = [int]$m.Count
        if ($null -ne $m.Sum) { $sum = [int64]$m.Sum }
    }
    return [pscustomobject]@{ Fichiers = $count; Octets = $sum }
}

function Hide-Url {
    param([string]$Url)
    return ($Url -replace '//[^/@\s]+@', '//***@')
}

function Read-EnvFile {
    param([string]$Path)
    $result = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $result }
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $l = ([string]$line).TrimStart([char]0xFEFF).Trim()
        if ($l.Length -eq 0 -or $l.StartsWith('#')) { continue }
        $m = [regex]::Match($l, '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
        if ($m.Success) {
            $v = $m.Groups[2].Value.Trim()
            if ($v.Length -ge 2) {
                $first = $v.Substring(0, 1)
                $last = $v.Substring($v.Length - 1, 1)
                if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                    $v = $v.Substring(1, $v.Length - 2)
                }
            }
            $result[$m.Groups[1].Value] = $v
        }
    }
    return $result
}

# Lance un programme externe sans que ses messages d'information soient pris pour des erreurs
function Invoke-Native {
    param([string]$Exe, [string[]]$Arguments)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $code = -1
    $raw = @()
    try {
        $raw = & $Exe @Arguments 2>&1
        $code = $LASTEXITCODE
    } catch {
        $raw = @($_.Exception.Message)
        $code = -1
    } finally {
        $ErrorActionPreference = $old
    }
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($r in @($raw)) {
        if ($null -ne $r) { $lines.Add(([string]$r).TrimEnd()) }
    }
    $arr = $lines.ToArray()
    return [pscustomobject]@{ Code = $code; Lines = $arr; Text = ($arr -join "`n") }
}

function Invoke-Git {
    param([string[]]$GitArgs)
    $all = @('-C', $script:ProjetPath) + $GitArgs
    return (Invoke-Native -Exe 'git' -Arguments $all)
}

function Find-Projet {
    param([string]$Given)
    $cands = @()
    if ($Given) {
        $cands += (Get-AbsolutePath $Given)
    } else {
        $cands += (Get-Location).Path
        if ($PSScriptRoot) {
            $cands += $PSScriptRoot
            $cands += (Split-Path -Parent $PSScriptRoot)
        }
    }
    foreach ($c in $cands) {
        if ($c -and (Test-Path -LiteralPath (Join-Path $c '.git')) -and (Test-Path -LiteralPath (Join-Path $c 'package.json'))) {
            return (Resolve-Path -LiteralPath $c).ProviderPath.TrimEnd('\')
        }
    }
    return $null
}

function New-ApiHeaders {
    param([string]$Key)
    $h = @{ 'apikey' = $Key }
    if ($Key -like 'eyJ*') { $h['Authorization'] = 'Bearer ' + $Key }
    return $h
}

# Lit une adresse de l'API Supabase et renvoie le texte JSON brut et les elements
function Get-JsonFromUrl {
    param([string]$Url, [hashtable]$Headers)
    $resp = Invoke-WebRequest -Uri $Url -Headers $Headers -UseBasicParsing -TimeoutSec 60
    $bytes = $resp.RawContentStream.ToArray()
    $text = [System.Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)
    $items = @()
    if ($text.Trim().Length -gt 0) {
        $parsed = ConvertFrom-Json -InputObject $text
        foreach ($x in $parsed) {
            if ($null -ne $x) { $items += $x }
        }
    }
    return [pscustomobject]@{ Text = $text; Items = $items }
}

# Chemin d'un fichier du stockage Supabase (product-media), ou $null si la reference n'en designe pas
function ConvertTo-StoragePath {
    param($Ref)
    if ($null -eq $Ref) { return $null }
    $s = ([string]$Ref).Trim()
    if ($s.Length -eq 0) { return $null }
    if ($s -match '^https?://') {
        $m = [regex]::Match($s, '/storage/v1/object/(?:public|sign|authenticated)/product-media/([^?#]+)')
        if (-not $m.Success) { return $null }
        return [uri]::UnescapeDataString($m.Groups[1].Value)
    }
    if ($s.Contains('/')) { return $s }
    return $null
}

# Lit (une seule fois) les collections et le contenu du site visibles par les visiteurs
function Get-DonneesVisibles {
    if ($script:DonneesLues) { return $true }
    if (-not $script:SbOk) { return $false }
    $h = New-ApiHeaders -Key $script:SbKey
    $p = Get-JsonFromUrl -Url ($script:SbUrl + '/rest/v1/products?select=*&order=id') -Headers $h
    $script:Produits = @($p.Items)
    $script:ProduitsTexte = $p.Text
    try {
        $s = Get-JsonFromUrl -Url ($script:SbUrl + '/rest/v1/site_media?select=*') -Headers $h
        $script:SiteMedia = @($s.Items)
        $script:SiteMediaTexte = $s.Text
    } catch {
        $script:SiteMedia = @()
        $script:SiteMediaTexte = ''
        Say 'INFO' 'La table site_media n''est pas lisible : ignoree.'
    }
    try {
        $c = Get-JsonFromUrl -Url ($script:SbUrl + '/rest/v1/promo_codes?select=*') -Headers $h
        $script:PromoTexte = $c.Text
    } catch {
        $script:PromoTexte = ''
    }
    $script:DonneesLues = $true
    return $true
}

# ----------------------------------------------------------------------------
# Verifications (ne creent rien)
# ----------------------------------------------------------------------------
function Step-Verifications {
    Say 'INFO' ('PowerShell ' + $PSVersionTable.PSVersion.ToString())

    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Say 'ERR' "Git est introuvable. Installez Git (git-scm.com), ou ouvrez le terminal depuis VS Code, puis relancez."
        $script:Bloquant = $true
        Add-Resultat 'Verifications' 'ERREUR' 'Git introuvable'
        return
    }
    $gv = Invoke-Native -Exe 'git' -Arguments @('--version')
    Say 'OK' ($gv.Text.Trim())

    $script:ProjetPath = [string](Find-Projet -Given $Projet)
    if (-not $script:ProjetPath) {
        Say 'ERR' "Projet introuvable : indiquez-le avec -Projet ""C:\chemin\du\projet"" (le dossier qui contient package.json et .git)."
        $script:Bloquant = $true
        Add-Resultat 'Verifications' 'ERREUR' 'Projet introuvable'
        return
    }
    Say 'OK' ('Projet : ' + $script:ProjetPath)

    $r = Invoke-Git -GitArgs @('rev-parse', '--is-inside-work-tree')
    if ($r.Code -ne 0) {
        Say 'ERR' ("Git ne peut pas lire ce depot : " + $r.Text)
        Say 'INFO' "Si le message parle de 'dubious ownership', lancez : git config --global --add safe.directory ""$($script:ProjetPath.Replace('\', '/'))"""
        $script:Bloquant = $true
        Add-Resultat 'Verifications' 'ERREUR' 'Depot Git illisible'
        return
    }
    $b = Invoke-Git -GitArgs @('rev-parse', '--abbrev-ref', 'HEAD')
    $script:Branche = $b.Text.Trim()
    $h = Invoke-Git -GitArgs @('rev-parse', '--short', 'HEAD')
    if ($h.Code -eq 0) {
        $script:CommitCourt = $h.Text.Trim()
        Say 'OK' ("Branche " + $script:Branche + ", dernier commit " + $script:CommitCourt)
    } else {
        Say 'ERR' "Le depot ne contient aucun commit : il n'y a rien a sauvegarder cote Git. Faites d'abord un commit."
        $script:Bloquant = $true
    }
    $o = Invoke-Git -GitArgs @('remote', 'get-url', 'origin')
    if ($o.Code -eq 0) {
        Say 'OK' ('Depot distant (origin) : ' + (Hide-Url $o.Text.Trim()))
    } else {
        Say 'WARN' "Aucun depot distant 'origin' : le code n'est pas sur GitHub. Une copie hors du PC est indispensable."
    }

    $st = Invoke-Git -GitArgs @('status', '--porcelain')
    $mods = @($st.Lines | Where-Object { $_.Trim().Length -gt 0 })
    $script:NbModifs = $mods.Count
    if ($script:NbModifs -eq 0) {
        Say 'OK' 'Aucune modification en attente : le code est entierement enregistre dans Git.'
    } elseif ($Commit) {
        Say 'INFO' ($script:NbModifs.ToString() + ' fichier(s) modifie(s) : ils seront enregistres (commit) avant la sauvegarde.')
    } else {
        Say 'WARN' ($script:NbModifs.ToString() + " fichier(s) modifie(s) ou nouveau(x) ne sont PAS enregistres dans Git. Ajoutez -Commit, ou une copie de travail sera ajoutee a la sauvegarde.")
    }

    $script:EnvPath = Join-Path $script:ProjetPath '.env.local'
    if (Test-Path -LiteralPath $script:EnvPath) {
        $ig = Invoke-Git -GitArgs @('check-ignore', '-q', '.env.local')
        if ($ig.Code -eq 0) {
            Say 'OK' '.env.local est ignore par Git : ses cles ne partiront pas sur GitHub.'
        } else {
            Say 'ERR' ".env.local n'est PAS ignore par Git : ajoutez la ligne .env*.local dans .gitignore avant tout commit."
            $script:EnvExpose = $true
        }
    } else {
        Say 'WARN' '.env.local est introuvable : les medias du stockage ne pourront pas etre telecharges.'
    }
    $tr = Invoke-Git -GitArgs @('ls-files')
    $suivis = @($tr.Lines | Where-Object { $_ -match '(^|/)(\.env(\.[^/]+)?|env\.local)$' -and $_ -notmatch '\.example$' })
    if ($suivis.Count -gt 0) {
        Say 'WARN' ('Un fichier de cles est suivi par Git : ' + ($suivis -join ', ') + '. Retirez-le du depot (git rm --cached) et changez les cles qu''il contient si elles sont sensibles.')
    }

    $cfg = Read-EnvFile -Path $script:EnvPath
    if ($cfg.ContainsKey('NEXT_PUBLIC_SUPABASE_URL')) { $script:SbUrl = $cfg['NEXT_PUBLIC_SUPABASE_URL'].TrimEnd('/') }
    if ($cfg.ContainsKey('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
        $script:SbKey = $cfg['NEXT_PUBLIC_SUPABASE_ANON_KEY']
    } elseif ($cfg.ContainsKey('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
        $script:SbKey = $cfg['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
    }
    if ($script:SbUrl -and $script:SbKey) {
        Say 'OK' ('Adresse Supabase trouvee dans .env.local, cle publique trouvee (' + $script:SbKey.Length + ' caracteres, non affichee).')
        try {
            $hd = New-ApiHeaders -Key $script:SbKey
            $null = Invoke-WebRequest -Uri ($script:SbUrl + '/rest/v1/products?select=id&limit=1') -Headers $hd -UseBasicParsing -TimeoutSec 30
            $script:SbOk = $true
            Say 'OK' 'Supabase repond depuis ce PC.'
        } catch {
            $status = ''
            try { if ($_.Exception.Response) { $status = [string][int]$_.Exception.Response.StatusCode } } catch { }
            if ($status -eq '401' -or $status -eq '403') {
                Say 'WARN' ("Supabase refuse la cle (code " + $status + "). Verifiez NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local.")
            } else {
                Say 'WARN' ("Supabase ne repond pas depuis ce PC : " + $_.Exception.Message)
            }
        }
    } else {
        Say 'WARN' 'Adresse ou cle Supabase absente de .env.local : les donnees visibles et les medias ne seront pas telecharges.'
    }

    $script:DestRacine = Get-AbsolutePath $Destination
    if (($script:DestRacine + '\').StartsWith(($script:ProjetPath + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
        Say 'ERR' "La destination est a l'interieur du projet : choisissez un dossier en dehors (par exemple C:\Sauvegardes-Zenoria)."
        $script:Bloquant = $true
    }
    $besoin = [int64]0
    foreach ($d in @($Originaux, $Documents)) {
        if ($d -and (Test-Path -LiteralPath $d -PathType Container)) {
            $info = Get-DirInfo -Path $d
            $besoin += $info.Octets
            Say 'OK' ('Dossier a copier : ' + $d + ' (' + $info.Fichiers + ' fichiers, ' + (Format-Taille $info.Octets) + ')')
        } elseif ($d) {
            Say 'ERR' ("Dossier introuvable : " + $d)
            $script:Bloquant = $true
        }
    }
    if (-not $Originaux) {
        $piste = Join-Path $env:USERPROFILE 'Downloads\Bagues'
        if (Test-Path -LiteralPath $piste -PathType Container) {
            Say 'WARN' ("Vos photos et videos d'origine ne sont pas incluses. Dossier probable : " + $piste + " (ajoutez -Originaux ""$piste"").")
        } else {
            Say 'WARN' "Aucun dossier d'originaux indique (-Originaux). Les fichiers du site sont recadres et compresses : vos originaux sont irremplacables."
        }
    }
    try {
        $racine = [System.IO.Path]::GetPathRoot($script:DestRacine)
        $di = New-Object System.IO.DriveInfo($racine)
        $libre = [int64]$di.AvailableFreeSpace
        $mult = 2
        if ($SansZip) { $mult = 1 }
        $necessaire = ($besoin * $mult) + 300MB
        if ($libre -lt $necessaire) {
            Say 'ERR' ('Espace disque insuffisant sur ' + $racine + ' : ' + (Format-Taille $libre) + ' libres, ' + (Format-Taille $necessaire) + ' necessaires. Choisissez un autre -Destination, ou ajoutez -SansZip.')
            $script:Bloquant = $true
        } else {
            Say 'OK' ('Espace disque : ' + (Format-Taille $libre) + ' libres sur ' + $racine)
        }
    } catch {
        Say 'INFO' 'Espace disque non verifiable pour cette destination.'
    }
    Say 'INFO' ('Destination : ' + $script:DestRacine)
    if ($script:Bloquant) { Add-Resultat 'Verifications' 'ERREUR' 'Un point bloquant doit etre corrige' } else { Add-Resultat 'Verifications' 'OK' 'Prerequis valides' }
}

# ----------------------------------------------------------------------------
# Etape 1 : le code
# ----------------------------------------------------------------------------
function Step-Code {
    $dossier = Join-Path $script:Dest 'code'
    New-Item -ItemType Directory -Force -Path $dossier | Out-Null

    if ($script:NbModifs -gt 0 -and $Commit) {
        if ($script:EnvExpose) {
            Say 'ERR' "Commit refuse : .env.local n'est pas ignore par Git. Corrigez .gitignore d'abord."
        } else {
            $a = Invoke-Git -GitArgs @('add', '.')
            $c = Invoke-Git -GitArgs @('commit', '-m', ('Sauvegarde automatique du ' + (Split-Path -Leaf $script:Dest)))
            if ($c.Code -eq 0) {
                Say 'OK' 'Modifications enregistrees dans Git (commit).'
                $script:NbModifs = 0
                $h = Invoke-Git -GitArgs @('rev-parse', '--short', 'HEAD')
                if ($h.Code -eq 0) { $script:CommitCourt = $h.Text.Trim() }
            } else {
                Say 'ERR' ('Le commit a echoue : ' + $c.Text)
            }
        }
    }

    if ($script:NbModifs -gt 0) {
        $work = Join-Path $script:Dest 'copie-de-travail'
        $rc = Invoke-Native -Exe 'robocopy' -Arguments @($script:ProjetPath, $work, '/E', '/XD', 'node_modules', '.next', '.git', '.vercel', '/XF', '.env', '.env.*', 'env.local', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
        if ($rc.Code -ge 0 -and $rc.Code -lt 8) {
            $info = Get-DirInfo -Path $work
            Say 'OK' ('Copie de travail creee (' + $info.Fichiers + ' fichiers, ' + (Format-Taille $info.Octets) + ') : elle contient aussi les modifications non enregistrees. Sans node_modules ni fichiers de cles.')
        } else {
            Say 'WARN' ('La copie de travail a echoue (code ' + $rc.Code + ').')
        }
    }

    $nom = 'sauvegarde-' + (Split-Path -Leaf $script:Dest)
    $existe = Invoke-Git -GitArgs @('tag', '-l', $nom)
    if ($existe.Text.Trim().Length -gt 0) { $nom = $nom + '-' + (Get-Date -Format 'HHmmss') }
    $t = Invoke-Git -GitArgs @('tag', '-a', $nom, '-m', ('Sauvegarde Zenoria du ' + (Split-Path -Leaf $script:Dest)))
    if ($t.Code -eq 0) {
        $script:Tag = $nom
        Say 'OK' ('Etiquette Git creee : ' + $nom)
    } else {
        Say 'WARN' ("L'etiquette n'a pas pu etre creee : " + $t.Text)
    }

    $bundle = Join-Path $dossier 'zenoria-code.bundle'
    $bu = Invoke-Git -GitArgs @('bundle', 'create', $bundle, '--all')
    if ($bu.Code -eq 0 -and (Test-Path -LiteralPath $bundle)) {
        $ve = Invoke-Git -GitArgs @('bundle', 'verify', $bundle)
        $len = (Get-Item -LiteralPath $bundle).Length
        if ($ve.Code -eq 0) {
            $script:BundlePath = $bundle
            Say 'OK' ('Copie complete du depot (bundle) creee et verifiee : ' + (Format-Taille $len))
        } else {
            Say 'ERR' ('Le bundle est cree mais sa verification a echoue : ' + $ve.Text)
        }
    } else {
        Say 'ERR' ('Le bundle n''a pas pu etre cree : ' + $bu.Text)
    }

    $zip = Join-Path $dossier 'zenoria-fichiers.zip'
    $ar = Invoke-Git -GitArgs @('archive', '--format=zip', '-o', $zip, 'HEAD')
    if ($ar.Code -eq 0 -and (Test-Path -LiteralPath $zip)) {
        $len2 = (Get-Item -LiteralPath $zip).Length
        Say 'OK' ('ZIP des fichiers du dernier commit cree : ' + (Format-Taille $len2))
    } else {
        Say 'WARN' ('Le ZIP des fichiers n''a pas pu etre cree : ' + $ar.Text)
    }

    if ($Pousser) {
        $p1 = Invoke-Git -GitArgs @('push')
        if ($p1.Code -eq 0) { Say 'OK' 'Code envoye vers GitHub (git push).' } else { Say 'WARN' ('git push a echoue : ' + $p1.Text) }
        if ($script:Tag) {
            $p2 = Invoke-Git -GitArgs @('push', 'origin', $script:Tag)
            if ($p2.Code -eq 0) { Say 'OK' ('Etiquette envoyee vers GitHub : ' + $script:Tag) } else { Say 'WARN' ('L''envoi de l''etiquette a echoue : ' + $p2.Text) }
        }
    } else {
        $script:AFaire.Add("Envoyer le code vers GitHub : git push, puis git push origin " + $script:Tag + " (ou relancez le script avec -Pousser).")
    }

    if ($script:BundlePath) { Add-Resultat 'Code' 'OK' ('Bundle + ZIP, commit ' + $script:CommitCourt) } else { Add-Resultat 'Code' 'ERREUR' 'Bundle non cree' }
}

# ----------------------------------------------------------------------------
# Etape 2 : la base de donnees
# ----------------------------------------------------------------------------
$script:RequeteSql = @'
-- Sauvegarde Zenoria : a coller dans Supabase > SQL Editor > New query, puis Run
-- Le resultat est un seul texte (JSON) a enregistrer dans un fichier base-AAAA-MM-JJ.json
select jsonb_pretty(jsonb_build_object(
  'sauvegarde_du', now(),
  'products',    (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.products p),
  'promo_codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.promo_codes c),
  'site_media',  (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.site_media s),
  'admin_users', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.admin_users a)
)) as sauvegarde;
'@

function Step-Base {
    $dossier = Join-Path $script:Dest 'base'
    New-Item -ItemType Directory -Force -Path $dossier | Out-Null

    # Scripts SQL du projet
    $roots = @($script:ProjetPath, (Join-Path $script:ProjetPath 'sql'))
    if ($ScriptsSql) { $roots += (Get-AbsolutePath $ScriptsSql) }
    $trouves = @()
    foreach ($r in $roots) {
        if (Test-Path -LiteralPath $r -PathType Container) {
            $trouves += @(Get-ChildItem -LiteralPath $r -Filter 'supabase_*.sql' -File -ErrorAction SilentlyContinue)
        }
    }
    $trouves = @($trouves | Sort-Object FullName -Unique)
    if ($trouves.Count -gt 0) {
        $cible = Join-Path $dossier 'scripts-sql'
        New-Item -ItemType Directory -Force -Path $cible | Out-Null
        foreach ($f in $trouves) { Copy-Item -LiteralPath $f.FullName -Destination $cible -Force }
        Say 'OK' ($trouves.Count.ToString() + ' script(s) SQL copie(s) : ils recreent la structure de la base.')
    } else {
        Say 'WARN' "Aucun fichier supabase_*.sql trouve. Placez-les dans un dossier sql\ du projet (ou utilisez -ScriptsSql) : ils sont la sauvegarde de la structure de la base."
        $script:AFaire.Add("Rassembler les scripts supabase_*.sql dans un dossier sql\ du projet et les enregistrer dans Git.")
    }

    # Requete d'export
    Write-TextFile (Join-Path $dossier 'requete-sauvegarde.sql') $script:RequeteSql
    $copie = $false
    try { Set-Clipboard -Value $script:RequeteSql; $copie = $true } catch { }
    $mode = @(
        'COMMENT SAUVEGARDER LA BASE DE DONNEES (3 minutes)',
        '',
        '1. Ouvrez Supabase (supabase.com/dashboard), puis votre projet, puis SQL Editor, puis New query.',
        '2. Collez la requete du fichier requete-sauvegarde.sql (elle est aussi dans le presse-papiers si le script a pu la copier).',
        '3. Cliquez sur Run.',
        '4. Copiez le contenu de la cellule du resultat (colonne sauvegarde).',
        '5. Collez-le dans un fichier texte et enregistrez-le dans ce dossier sous le nom base-AAAA-MM-JJ.json.',
        '',
        'Si Supabase affiche une erreur du type relation does not exist, supprimez dans la requete la ligne de la table concernee.',
        'Les comptes des utilisateurs (adresses e-mail, mots de passe) ne sont PAS dans cette sauvegarde.'
    )
    Write-TextFile (Join-Path $dossier 'COMMENT-SAUVEGARDER-LA-BASE.txt') ($mode -join "`r`n")
    if ($copie) {
        Say 'OK' 'Requete d''export de la base copiee dans le presse-papiers (et enregistree dans base\requete-sauvegarde.sql).'
    } else {
        Say 'OK' 'Requete d''export de la base enregistree dans base\requete-sauvegarde.sql.'
    }
    $script:AFaire.Add("Exporter la base : collez la requete dans Supabase > SQL Editor > Run, puis enregistrez le resultat dans base\base-AAAA-MM-JJ.json (voir base\COMMENT-SAUVEGARDER-LA-BASE.txt).")

    # Donnees visibles par les visiteurs (copie de secours, sans rien installer)
    try {
        if (Get-DonneesVisibles) {
            $vis = Join-Path $dossier 'donnees-visibles'
            New-Item -ItemType Directory -Force -Path $vis | Out-Null
            Write-TextFile (Join-Path $vis 'products-visibles.json') $script:ProduitsTexte
            if ($script:SiteMediaTexte) { Write-TextFile (Join-Path $vis 'site_media.json') $script:SiteMediaTexte }
            if ($script:PromoTexte) { Write-TextFile (Join-Path $vis 'promo_codes-visibles.json') $script:PromoTexte }
            Say 'OK' ('Donnees visibles par les visiteurs enregistrees : ' + $script:Produits.Count + ' collection(s) en ligne. Les collections masquees n''y figurent pas : utilisez l''export SQL.')
        } else {
            Say 'WARN' 'Donnees visibles non lues (Supabase injoignable ou cle absente).'
        }
    } catch {
        Say 'WARN' ('Lecture des donnees visibles impossible : ' + $_.Exception.Message)
    }
    Add-Resultat 'Base de donnees' 'A FAIRE' 'Export SQL a lancer dans le navigateur'
}

# ----------------------------------------------------------------------------
# Etape 3 : photos et videos du stockage
# ----------------------------------------------------------------------------
function Step-Medias {
    if ($SansMedias) {
        Say 'INFO' 'Etape ignoree (-SansMedias).'
        Add-Resultat 'Medias du stockage' 'IGNORE' '-SansMedias'
        return
    }
    if (-not (Get-DonneesVisibles)) {
        Say 'WARN' 'Medias non telecharges : Supabase est injoignable ou la cle est absente.'
        Add-Resultat 'Medias du stockage' 'ATTENTION' 'Non telecharges'
        $script:AFaire.Add("Telecharger les medias du stockage (Supabase > Storage), ou relancer le script quand Supabase est joignable.")
        return
    }
    $dossier = Join-Path $script:Dest 'medias'
    New-Item -ItemType Directory -Force -Path $dossier | Out-Null

    $set = @{}
    foreach ($p in $script:Produits) {
        foreach ($ph in @($p.photos)) { $sp = ConvertTo-StoragePath $ph; if ($sp) { $set[$sp] = $true } }
        $sv = ConvertTo-StoragePath $p.video
        if ($sv) { $set[$sv] = $true }
    }
    foreach ($s in $script:SiteMedia) {
        $ss = ConvertTo-StoragePath $s.path
        if ($ss) { $set[$ss] = $true }
    }
    $rels = @($set.Keys | Sort-Object)
    if ($rels.Count -eq 0) {
        Say 'INFO' 'Aucun fichier du stockage n''est utilise par les collections visibles.'
        Add-Resultat 'Medias du stockage' 'OK' '0 fichier'
        return
    }
    Say 'INFO' ($rels.Count.ToString() + ' fichier(s) a telecharger...')

    $liste = New-Object System.Collections.Generic.List[object]
    $ok = 0
    $ko = 0
    $total = [int64]0
    foreach ($rel in $rels) {
        if ($rel -match '(^|/)\.\.(/|$)' -or $rel -match '[<>:"|?*\\]') {
            Say 'WARN' ('Chemin inhabituel ignore : ' + $rel)
            $liste.Add([pscustomobject]@{ Chemin = $rel; Octets = 0; Statut = 'ignore (chemin inhabituel)' })
            $ko++
            continue
        }
        $segments = @()
        foreach ($seg in $rel.Split('/')) { $segments += [uri]::EscapeDataString($seg) }
        $url = $script:SbUrl + '/storage/v1/object/public/product-media/' + ($segments -join '/')
        $local = Join-Path $dossier ($rel.Replace('/', '\'))
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $local) | Out-Null
            Invoke-WebRequest -Uri $url -OutFile $local -UseBasicParsing -TimeoutSec 300
            $len = (Get-Item -LiteralPath $local).Length
            if ($len -le 0) { throw 'fichier vide' }
            $total += $len
            $ok++
            $liste.Add([pscustomobject]@{ Chemin = $rel; Octets = $len; Statut = 'ok' })
            Say 'INFO' ($rel + ' (' + (Format-Taille $len) + ')')
        } catch {
            $ko++
            $liste.Add([pscustomobject]@{ Chemin = $rel; Octets = 0; Statut = ('echec : ' + $_.Exception.Message) })
            Say 'WARN' ('Echec : ' + $rel + ' - ' + $_.Exception.Message)
        }
    }
    $liste | Export-Csv -LiteralPath (Join-Path $dossier 'liste-medias.csv') -NoTypeInformation -Encoding UTF8
    if ($ko -eq 0) {
        Say 'OK' ($ok.ToString() + ' fichier(s) telecharge(s), ' + (Format-Taille $total) + ' au total.')
        Add-Resultat 'Medias du stockage' 'OK' ($ok.ToString() + ' fichier(s), ' + (Format-Taille $total))
    } else {
        Say 'WARN' ($ok.ToString() + ' fichier(s) telecharge(s), ' + $ko.ToString() + ' en echec (voir medias\liste-medias.csv).')
        Add-Resultat 'Medias du stockage' 'ATTENTION' ($ok.ToString() + ' ok, ' + $ko.ToString() + ' en echec')
    }
    Say 'INFO' 'Les fichiers des collections masquees et les fichiers orphelins ne sont pas copies. Les anciens medias de public\images sont deja dans Git.'
}

# ----------------------------------------------------------------------------
# Etape 4 : originaux et documents
# ----------------------------------------------------------------------------
function Copy-Dossier {
    param([string]$Source, [string]$Nom, [string]$Libelle)
    if (-not $Source) { return }
    $src = Get-AbsolutePath $Source
    if (-not (Test-Path -LiteralPath $src -PathType Container)) {
        Say 'ERR' ('Dossier introuvable : ' + $src)
        Add-Resultat $Libelle 'ERREUR' 'Dossier introuvable'
        return
    }
    $dst = Join-Path $script:Dest $Nom
    $avant = Get-DirInfo -Path $src
    Say 'INFO' ('Copie de ' + $src + ' (' + $avant.Fichiers + ' fichiers, ' + (Format-Taille $avant.Octets) + ')...')
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    $apres = Get-DirInfo -Path $dst
    if ($apres.Fichiers -eq $avant.Fichiers -and $apres.Octets -eq $avant.Octets) {
        Say 'OK' ($Libelle + ' copies : ' + $apres.Fichiers + ' fichiers, ' + (Format-Taille $apres.Octets) + ' (identiques a la source).')
        Add-Resultat $Libelle 'OK' ($apres.Fichiers.ToString() + ' fichiers')
    } else {
        Say 'WARN' ($Libelle + ' : la copie differe de la source (' + $apres.Fichiers + ' fichiers au lieu de ' + $avant.Fichiers + ').')
        Add-Resultat $Libelle 'ATTENTION' 'Copie differente de la source'
    }
}

function Step-Originaux {
    if (-not $Originaux -and -not $Documents) {
        Say 'WARN' 'Aucun dossier d''originaux ni de documents indique : rien n''est copie dans cette etape.'
        Add-Resultat 'Originaux et documents' 'A FAIRE' 'Non indiques'
        $script:AFaire.Add("Copier a la main vos photos et videos d'origine et vos documents (ou relancer avec -Originaux et -Documents).")
        return
    }
    Copy-Dossier -Source $Originaux -Nom 'originaux' -Libelle 'Originaux'
    Copy-Dossier -Source $Documents -Nom 'documents' -Libelle 'Documents'
}

# ----------------------------------------------------------------------------
# Etape 5 : reglages
# ----------------------------------------------------------------------------
function Step-Reglages {
    $dossier = Join-Path $script:Dest 'reglages'
    New-Item -ItemType Directory -Force -Path $dossier | Out-Null
    $cfg = Read-EnvFile -Path $script:EnvPath
    $noms = @($cfg.Keys | Sort-Object)
    if ($noms.Count -gt 0) {
        $entete = @('Noms des variables de .env.local (les valeurs ne sont PAS copiees) :', '')
        $contenu = $entete + $noms
        Write-TextFile (Join-Path $dossier 'noms-des-variables.txt') ($contenu -join "`r`n")
        Say 'OK' ($noms.Count.ToString() + ' nom(s) de variable note(s) (sans leurs valeurs).')
    }
    $modele = @(
        'REGLAGES A NOTER (aucun mot de passe ni cle secrete ici)',
        'Les secrets vont dans un gestionnaire de mots de passe, jamais dans ce dossier.',
        '',
        'VERCEL (vercel.com > projet > Settings)',
        '[ ] Noms des variables d''environnement (Environment Variables) :',
        '[ ] Domaine(s) :',
        '[ ] Branche de production (Git) :',
        '[ ] Plan (Hobby ou Pro) :',
        '',
        'SUPABASE (supabase.com/dashboard > projet)',
        '[ ] Authentication > URL Configuration : Site URL et Redirect URLs :',
        '[ ] Authentication > Emails > SMTP Settings : fournisseur, adresse d''expedition, port (pas le mot de passe) :',
        '[ ] Authentication > Audit Logs : "Write audit logs to the database" active ou non :',
        '[ ] Region du projet et version de Postgres :',
        '[ ] Compte(s) administrateur(s) : adresses e-mail :',
        '',
        'RESEND (resend.com)',
        '[ ] Nom de la cle API utilisee et son usage (pas la cle elle-meme) :',
        '[ ] Domaine d''envoi verifie ou non :',
        '',
        'GITHUB',
        '[ ] Nom du depot et compte proprietaire :'
    )
    Write-TextFile (Join-Path $dossier 'A-COMPLETER.txt') ($modele -join "`r`n")
    Say 'OK' 'Modele de reglages cree : reglages\A-COMPLETER.txt'
    Add-Resultat 'Reglages' 'A FAIRE' 'Modele a completer'
    $script:AFaire.Add("Completer reglages\A-COMPLETER.txt (captures d'ecran ou notes des tableaux de bord) et ranger les secrets dans un gestionnaire de mots de passe.")
}

# ----------------------------------------------------------------------------
# Etape 6 : resume, empreintes, archive
# ----------------------------------------------------------------------------
function Step-Cloture {
    $jour = Split-Path -Leaf $script:Dest
    $lisez = @(
        ('SAUVEGARDE ZENORIA DU ' + $jour),
        '',
        ('Commit Git : ' + $script:CommitCourt + '  (branche ' + $script:Branche + ')'),
        ('Etiquette Git : ' + $script:Tag),
        '',
        'CONTENU',
        '  code\        zenoria-code.bundle = tout le depot, historique compris ; zenoria-fichiers.zip = les fichiers du dernier commit',
        '  copie-de-travail\  (si present) les fichiers du projet avec les modifications non enregistrees',
        '  base\        scripts SQL, requete d''export, donnees visibles par les visiteurs',
        '  medias\      photos et videos envoyees depuis l''administration',
        '  originaux\ et documents\  (si indiques)',
        '  reglages\    modele a completer',
        '  empreintes-sha256.csv  controle d''integrite des fichiers',
        '',
        'RESTAURER LE CODE',
        '  git clone code\zenoria-code.bundle C:\Temp\zenoria-test',
        '  puis : npm install, et recreer .env.local (les cles ne sont pas dans cette sauvegarde).',
        '',
        'A FAIRE A LA MAIN (voir le plan de sauvegarde)',
        '  - exporter la base dans le navigateur (base\COMMENT-SAUVEGARDER-LA-BASE.txt)',
        '  - completer reglages\A-COMPLETER.txt',
        '  - copier cette sauvegarde HORS du PC',
        '  - tester la restauration du code'
    )
    Write-TextFile (Join-Path $script:Dest 'LISEZ-MOI.txt') ($lisez -join "`r`n")
    Write-TextFile (Join-Path $script:Dest 'journal-sauvegarde.txt') ($script:Journal -join "`r`n")

    try {
        $prefix = $script:Dest.TrimEnd('\') + '\'
        $hashes = @(Get-ChildItem -LiteralPath $script:Dest -Recurse -File -Force | Get-FileHash -Algorithm SHA256)
        $rows = @()
        foreach ($h in $hashes) { $rows += [pscustomobject]@{ Fichier = $h.Path.Substring($prefix.Length); SHA256 = $h.Hash } }
        if ($rows.Count -gt 0) {
            $rows | Export-Csv -LiteralPath (Join-Path $script:Dest 'empreintes-sha256.csv') -NoTypeInformation -Encoding UTF8
            Say 'OK' ('Empreintes SHA-256 calculees pour ' + $rows.Count.ToString() + ' fichier(s) : elles permettent de detecter une copie abimee.')
        }
    } catch {
        Say 'WARN' ('Empreintes non calculees : ' + $_.Exception.Message)
    }

    if ($SansZip) {
        Say 'INFO' 'Archive ZIP ignoree (-SansZip).'
    } else {
        try {
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = Join-Path $script:DestRacine ('zenoria-' + $jour + '.zip')
            if (Test-Path -LiteralPath $zip) {
                Say 'WARN' ('L''archive existe deja, elle n''est pas remplacee : ' + $zip)
            } else {
                [System.IO.Compression.ZipFile]::CreateFromDirectory($script:Dest, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
                $script:ZipPath = $zip
                $zl = (Get-Item -LiteralPath $zip).Length
                Say 'OK' ('Archive creee : ' + $zip + ' (' + (Format-Taille $zl) + ')')
            }
        } catch {
            Say 'WARN' ('Archive ZIP non creee : ' + $_.Exception.Message + ' (le dossier de sauvegarde reste utilisable tel quel).')
        }
    }
}

function Invoke-Step {
    param([string]$Titre, [scriptblock]$Corps)
    Say 'STEP' $Titre
    try {
        & $Corps
    } catch {
        Say 'ERR' ('Etape interrompue : ' + $_.Exception.Message)
        Add-Resultat $Titre 'ERREUR' $_.Exception.Message
    }
}

function Show-Resume {
    Write-Host ''
    Write-Host '================ RESUME ================' -ForegroundColor Cyan
    foreach ($r in $script:Resultats) {
        $c = 'Gray'
        if ($r.Statut -eq 'OK') { $c = 'Green' }
        if ($r.Statut -eq 'ATTENTION' -or $r.Statut -eq 'A FAIRE') { $c = 'Yellow' }
        if ($r.Statut -eq 'ERREUR') { $c = 'Red' }
        Write-Host (('{0,-26} {1,-10} {2}' -f $r.Etape, $r.Statut, $r.Detail)) -ForegroundColor $c
    }
    Write-Host ''
    Write-Host ('Avertissements : ' + $script:NbWarn + '   Erreurs : ' + $script:NbErr)
}

# ============================================================================
# PROGRAMME PRINCIPAL (toutes les fonctions sont definies au-dessus)
# ============================================================================
Write-Host ''
Write-Host 'Sauvegarde du projet Zenoria' -ForegroundColor Cyan
if ($SeulementVerifier) { Write-Host 'Mode verification : rien ne sera cree ni ecrit.' -ForegroundColor Cyan }

Invoke-Step 'Verifications' { Step-Verifications }

if ($SeulementVerifier) {
    Show-Resume
    Write-Host ''
    if ($script:Bloquant -or $script:NbErr -gt 0) {
        Write-Host 'Corrigez les points en rouge, puis relancez.' -ForegroundColor Red
        exit 1
    }
    if ($script:NbWarn -gt 0) {
        Write-Host 'Aucun point bloquant. Lisez les avertissements en jaune, puis lancez la sauvegarde en retirant -SeulementVerifier.' -ForegroundColor Yellow
    } else {
        Write-Host 'Tout est pret. Lancez la sauvegarde en retirant -SeulementVerifier.' -ForegroundColor Green
    }
    exit 0
}

if ($script:Bloquant) {
    Show-Resume
    Write-Host ''
    Write-Host 'Sauvegarde non lancee : corrigez d''abord les points en rouge (ou lancez avec -SeulementVerifier pour les revoir).' -ForegroundColor Red
    exit 1
}

$racine = $script:DestRacine
$jour = Get-Date -Format 'yyyy-MM-dd'
$script:Dest = Join-Path $racine $jour
if (Test-Path -LiteralPath $script:Dest) {
    $script:Dest = Join-Path $racine ($jour + '_' + (Get-Date -Format 'HHmmss'))
}
New-Item -ItemType Directory -Force -Path $script:Dest | Out-Null
Say 'INFO' ('Dossier de la sauvegarde : ' + $script:Dest)

Invoke-Step '1. Le code' { Step-Code }
Invoke-Step '2. La base de donnees' { Step-Base }
Invoke-Step '3. Les photos et videos du stockage' { Step-Medias }
Invoke-Step '4. Vos originaux et documents' { Step-Originaux }
Invoke-Step '5. Les reglages' { Step-Reglages }
Invoke-Step '6. Controle et archive' { Step-Cloture }

Show-Resume
Write-Host ''
Write-Host 'A FAIRE A LA MAIN :' -ForegroundColor Yellow
foreach ($a in $script:AFaire) { Write-Host ('  - ' + $a) -ForegroundColor Yellow }
Write-Host '  - Copier la sauvegarde HORS du PC (cle USB, cloud personnel) et noter les secrets dans un gestionnaire de mots de passe.' -ForegroundColor Yellow
if ($script:BundlePath) {
    Write-Host ('  - Tester la restauration du code : git clone "' + $script:BundlePath + '" "C:\Temp\zenoria-test"') -ForegroundColor Yellow
}
Write-Host ''
Write-Host ('Sauvegarde : ' + $script:Dest) -ForegroundColor Green
if ($script:ZipPath) { Write-Host ('Archive    : ' + $script:ZipPath) -ForegroundColor Green }

if ($script:NbErr -gt 0) { exit 1 }
exit 0
