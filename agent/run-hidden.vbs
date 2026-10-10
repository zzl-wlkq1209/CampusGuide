Option Explicit

Dim shell, fso, scriptDir, projectDir, launcherPath, mode
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(scriptDir)
launcherPath = fso.BuildPath(scriptDir, "run-agent.cmd")
mode = "--once"
If WScript.Arguments.Count > 0 Then mode = WScript.Arguments(0)

shell.CurrentDirectory = projectDir
shell.Run Chr(34) & launcherPath & Chr(34) & " " & mode, 0, True
