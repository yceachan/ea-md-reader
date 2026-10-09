; Offer Open With choices without replacing extension defaults or UserChoice.
!macro emdAssociate EXT CLASS DESCRIPTION
  ; Leave another installation's class untouched.
  ReadRegStr $R0 HKCU "Software\Classes\${CLASS}\shell\open\command" ""
  StrCmp $R0 "" emd_associate_${EXT}
  StrCmp $R0 '$\"$INSTDIR\emd.exe$\" $\"%1$\"' emd_associate_${EXT} emd_skip_${EXT}
  emd_associate_${EXT}:
  WriteRegStr HKCU "Software\Classes\${CLASS}" "" "${DESCRIPTION}"
  WriteRegStr HKCU "Software\Classes\${CLASS}\DefaultIcon" "" '$\"$INSTDIR\emd.exe$\",0'
  WriteRegStr HKCU "Software\Classes\${CLASS}\shell\open\command" "" '$\"$INSTDIR\emd.exe$\" $\"%1$\"'
  WriteRegNone HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${CLASS}"
  emd_skip_${EXT}:
!macroend

!macro emdUnassociate EXT CLASS
  ReadRegStr $R0 HKCU "Software\Classes\${CLASS}\shell\open\command" ""
  StrCmp $R0 '$\"$INSTDIR\emd.exe$\" $\"%1$\"' 0 +2
    DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${CLASS}"
!macroend

!macro emdRemoveClass CLASS
  ReadRegStr $R0 HKCU "Software\Classes\${CLASS}\shell\open\command" ""
  StrCmp $R0 '$\"$INSTDIR\emd.exe$\" $\"%1$\"' 0 +2
    DeleteRegKey HKCU "Software\Classes\${CLASS}"
!macroend

!macro customInstall
  !insertmacro emdAssociate "md" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "markdown" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "mdown" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "mkd" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "mkdn" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "mdx" "emd.Markdown" "Markdown document"
  !insertmacro emdAssociate "html" "emd.HTML" "HTML document"
  !insertmacro emdAssociate "htm" "emd.HTML" "HTML document"
!macroend

!macro customUnInstall
  !insertmacro emdUnassociate "md" "emd.Markdown"
  !insertmacro emdUnassociate "markdown" "emd.Markdown"
  !insertmacro emdUnassociate "mdown" "emd.Markdown"
  !insertmacro emdUnassociate "mkd" "emd.Markdown"
  !insertmacro emdUnassociate "mkdn" "emd.Markdown"
  !insertmacro emdUnassociate "mdx" "emd.Markdown"
  !insertmacro emdUnassociate "html" "emd.HTML"
  !insertmacro emdUnassociate "htm" "emd.HTML"
  !insertmacro emdRemoveClass "emd.Markdown"
  !insertmacro emdRemoveClass "emd.HTML"
!macroend
