!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "MUI2.nsh"
RequestExecutionLevel admin

Name "Cyberpunk 2077 Modding Toolkit"
OutFile "CP2077ModdingToolkitSetup.exe"
InstallDir "$PROGRAMFILES64\CP2077ModdingToolkit"

Page directory
Page instfiles

Section "Install Toolkit"
  SetOutPath "$INSTDIR"
  ; Copy app files (handled by electron-builder)
SectionEnd

Section "Install Dependencies"
  SetOutPath "$INSTDIR\tools"
  CreateDirectory "$INSTDIR\tools"

  ; Try to copy CyberCAT-SimpleGUI.exe if bundled
  IfFileExists "$EXEDIR\tools\CyberCAT-SimpleGUI.exe" 0 +3
    CopyFiles /SILENT "$EXEDIR\tools\CyberCAT-SimpleGUI.exe" "$INSTDIR\tools\CyberCAT-SimpleGUI.exe"
    Goto +6

  ; If not bundled, prompt user to download and select it
  MessageBox MB_ICONEXCLAMATION "CyberCAT-SimpleGUI.exe (save editor) is required.\r\n\r\nPlease download it from:\r\nhttps://github.com/Deweh/CyberCAT-SimpleGUI/releases/latest\r\n\r\nAfter downloading, click OK to select the file."
  nsDialogs::SelectFileDialog "Open" "CyberCAT-SimpleGUI.exe|CyberCAT-SimpleGUI.exe" "" ""
  Pop $8
  StrCmp $8 "" +2
    CopyFiles /SILENT $8 "$INSTDIR\tools\CyberCAT-SimpleGUI.exe"

  ; Try to download WolvenKit CLI from official link
  inetc::get "https://github.com/WolvenKit/WolvenKit/releases/download/v8.16.1/WolvenKit.CLI.exe" "$INSTDIR\tools\WolvenKit.CLI.exe" /END
  Pop $0
  StrCmp $0 "OK" +3
    MessageBox MB_ICONEXCLAMATION "Failed to download WolvenKit CLI automatically.\r\n\r\nPlease download it manually from:\r\nhttps://github.com/WolvenKit/WolvenKit/releases/latest\r\n\r\nAfter downloading, click OK to select the file."
    nsDialogs::SelectFileDialog "Open" "WolvenKit.CLI.exe|WolvenKit.CLI.exe" "" ""
    Pop $1
    StrCmp $1 "" +2
      CopyFiles /SILENT $1 "$INSTDIR\tools\WolvenKit.CLI.exe"

  ; Mark WolvenKit CLI as present (create a marker file)
  FileOpen $2 "$INSTDIR\tools\wolvenkit_marker.txt" w
  FileWrite $2 "WolvenKit CLI installed"
  FileClose $2

  ; Download Blender (installer)
  inetc::get "https://download.blender.org/release/Blender3.6/blender-3.6.0-windows-x64.msi" "$TEMP\blender.msi" /END
  Pop $3
  StrCmp $3 "OK" +2
    MessageBox MB_ICONSTOP "Failed to download Blender: $3" IDOK
  ExecWait 'msiexec /i "$TEMP\blender.msi" /qn'

  ; Download xVASynth (installer, user must have Steam, or provide link)
  MessageBox MB_ICONINFORMATION "xVASynth is required for advanced voice generation. Please install it from Steam if you have not already: https://store.steampowered.com/app/1765720/xVASynth/"

  ; Download CyberVoice models (example, replace with actual model URLs or prompt user)
  ; inetc::get "https://example.com/cybervoice_model.pth" "$INSTDIR\voice_models\cybervoice_model.pth" /END
  ; Pop $2
  ; StrCmp $2 "OK" +2
  ;   MessageBox MB_ICONSTOP "Failed to download CyberVoice model: $2" IDOK

  ; Download other required tools (oggenc, ww2ogg, revorb, etc.)
  inetc::get "https://github.com/xiph/vorbis-tools/releases/download/v1.4.2/oggenc.exe" "$INSTDIR\tools\oggenc.exe" /END
  Pop $4
  inetc::get "https://github.com/hcs64/ww2ogg/releases/download/v0.24/ww2ogg.exe" "$INSTDIR\tools\ww2ogg.exe" /END
  Pop $5
  inetc::get "https://github.com/hcs64/ww2ogg/releases/download/v0.24/packed_codebooks_aoTuV_603.bin" "$INSTDIR\tools\packed_codebooks_aoTuV_603.bin" /END
  Pop $6
  inetc::get "https://github.com/hcs64/revorb/releases/download/v1.8.0/revorb.exe" "$INSTDIR\tools\revorb.exe" /END
  Pop $7

  ; Optionally download other dependencies as needed

SectionEnd

Section -PostInstall
  ; Optionally add desktop/start menu shortcuts
  CreateShortCut "$DESKTOP\CP2077 Modding Toolkit.lnk" "$INSTDIR\CP2077ModdingToolkit.exe"
  CreateShortCut "$SMPROGRAMS\CP2077 Modding Toolkit.lnk" "$INSTDIR\CP2077ModdingToolkit.exe"
SectionEnd 