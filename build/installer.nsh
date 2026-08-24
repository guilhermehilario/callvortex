; Libera o áudio P2P no Firewall do Windows durante a instalação
; (o instalador NSIS já roda elevado, sem prompt extra além do UAC padrão).
!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="CallVortex"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="CallVortex" dir=in action=allow program="$INSTDIR\CallVortex.exe" enable=yes profile=any'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="CallVortex" dir=out action=allow program="$INSTDIR\CallVortex.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="CallVortex"'
!macroend
