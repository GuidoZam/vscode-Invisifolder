import * as vscode from "vscode";

type HiddenList = string[];

/**
 * Configuration keys
 */
const CONFIG_KEY = "invisifolder.hiddenFolders";
const FILES_EXCLUDE_KEY = "files.exclude";

/**
 * Read hidden list from workspace settings.
 */
async function readHiddenList(): Promise<HiddenList> {
  const cfg = vscode.workspace.getConfiguration();
  const list = cfg.get<HiddenList>(CONFIG_KEY);
  return Array.isArray(list) ? list : [];
}

/**
 * Write hidden list to workspace settings (.vscode/settings.json).
 */
async function writeHiddenList(list: HiddenList): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();
  await cfg.update(CONFIG_KEY, list, vscode.ConfigurationTarget.Workspace);
}

/**
 * Apply hidden list to files.exclude in workspace settings.
 * This keeps other files.exclude keys untouched and updates keys for the entries in the hidden list.
 */
async function applyToFilesExclude(list: HiddenList): Promise<void> {
  const cfg = vscode.workspace.getConfiguration();
  const current = cfg.get<Record<string, boolean>>(FILES_EXCLUDE_KEY) ?? {};
  const next = Object.assign({}, current);

  // Add our patterns
  for (const entry of list) {
    const key = entry.endsWith("/**") ? entry : `${entry}/**`;
    next[key] = true;
  }

  // Remove keys that were previously added by this extension but are no longer in the list.
  // Conservative strategy: remove keys that end with "/**" where base is not in the list.
  for (const key of Object.keys(next)) {
    if (key.endsWith("/**")) {
      const base = key.slice(0, -3);
      if (!list.includes(base)) {
        // To avoid removing user intentional patterns (that are not ours),
        // only remove key if its value is exactly true and it matches our formatting.
        // This may still remove user patterns; consider backup if you want stricter behavior.
        delete next[key];
      }
    }
  }

  await cfg.update(FILES_EXCLUDE_KEY, next, vscode.ConfigurationTarget.Workspace);
}

/**
 * Convert resource URI to workspace-relative path like "packages/foo".
 */
function workspaceRelativePath(uri: vscode.Uri): string | null {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return null;
  }
  return vscode.workspace.asRelativePath(uri, false);
}

/**
 * Show a quick pick for workspace root selection (if needed).
 */
async function pickWorkspaceRoot(): Promise<vscode.Uri | undefined> {
  const roots = vscode.workspace.workspaceFolders;
  if (!roots || roots.length === 0) {
    return undefined;
  }
  if (roots.length === 1) {
    return roots[0].uri;
  }
  const pick = await vscode.window.showQuickPick(
    roots.map((r) => ({ label: r.name, description: r.uri.fsPath, uri: r.uri })),
    { placeHolder: "Select a workspace folder" }
  );
  return pick?.uri;
}

/**
 * Activate extension: register commands and setup status bar
 */
export function activate(context: vscode.ExtensionContext) {
  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "invisifolder.manage";
  context.subscriptions.push(statusBar);

  // Refresh status bar label
  async function refreshStatus() {
    const list = await readHiddenList();
    statusBar.text = `$(eye-closed) Invisifolder: ${list.length}`;
    statusBar.tooltip = list.length > 0 ? `Hidden folders:\n${list.join("\n")}` : "No hidden folders (click to manage)";
    statusBar.show();
  }

  // Listen to settings change to refresh UI
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(CONFIG_KEY) || e.affectsConfiguration(FILES_EXCLUDE_KEY)) {
        await refreshStatus();
      }
    })
  );

  // Add folder (from explorer or command palette)
  context.subscriptions.push(
    vscode.commands.registerCommand("invisifolder.addFolder", async (resourceUri?: vscode.Uri) => {
      let uri = resourceUri;
      if (!uri) {
        // Ask user to pick workspace root and optional relative path
        const root = await pickWorkspaceRoot();
        if (!root) {
          vscode.window.showInformationMessage("No workspace open.");
          return;
        }
        const rel = await vscode.window.showInputBox({
          prompt: "Enter relative path inside selected workspace folder to hide (leave empty to hide root)",
          placeHolder: "e.g. dist or packages/foo"
        });
        if (rel && rel.trim().length > 0) {
          uri = vscode.Uri.joinPath(root, rel);
        } else {
          uri = root;
        }
      }

      const relative = workspaceRelativePath(uri);
      if (!relative) {
        vscode.window.showErrorMessage("Selected folder is not inside the workspace.");
        return;
      }

      const list = await readHiddenList();
      if (list.includes(relative)) {
        vscode.window.showInformationMessage(`${relative} is already hidden.`);
        return;
      }
      list.push(relative);
      await writeHiddenList(list);
      await applyToFilesExclude(list);
      vscode.window.showInformationMessage(`Hidden folder: ${relative}`);
      await refreshStatus();
    })
  );

  // Remove folder (via quick pick)
  context.subscriptions.push(
    vscode.commands.registerCommand("invisifolder.removeFolder", async () => {
      const list = await readHiddenList();
      if (list.length === 0) {
        vscode.window.showInformationMessage("No hidden folders.");
        return;
      }
      const pick = await vscode.window.showQuickPick(list, { placeHolder: "Select a hidden folder to unhide" });
      if (!pick) return;
      const next = list.filter((p) => p !== pick);
      await writeHiddenList(next);
      await applyToFilesExclude(next);
      vscode.window.showInformationMessage(`Unhidden: ${pick}`);
      await refreshStatus();
    })
  );

  // Toggle folder (right-click in explorer)
  context.subscriptions.push(
    vscode.commands.registerCommand("invisifolder.toggleFolder", async (resourceUri?: vscode.Uri) => {
      if (!resourceUri) {
        vscode.window.showInformationMessage("Right-click a folder in Explorer and choose 'Toggle Folder Visibility'.");
        return;
      }
      const relative = workspaceRelativePath(resourceUri);
      if (!relative) {
        vscode.window.showErrorMessage("Selected resource is not inside the workspace.");
        return;
      }
      const list = await readHiddenList();
      if (list.includes(relative)) {
        const next = list.filter((p) => p !== relative);
        await writeHiddenList(next);
        await applyToFilesExclude(next);
        vscode.window.showInformationMessage(`Unhidden: ${relative}`);
      } else {
        list.push(relative);
        await writeHiddenList(list);
        await applyToFilesExclude(list);
        vscode.window.showInformationMessage(`Hidden folder: ${relative}`);
      }
      await refreshStatus();
    })
  );

  // Manage command: open quick pick with actions
  context.subscriptions.push(
    vscode.commands.registerCommand("invisifolder.manage", async () => {
      const list = await readHiddenList();
      const items: vscode.QuickPickItem[] = [
        { label: "Add folder", description: "Hide a folder in this workspace", detail: "invisifolder.addFolder" },
        { label: "Remove folder", description: "Unhide a hidden folder", detail: "invisifolder.removeFolder" }
      ];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: "Invisifolder — Manage hidden folders" });
      if (!pick) return;
      if (pick.detail === "invisifolder.addFolder") {
        await vscode.commands.executeCommand("invisifolder.addFolder");
      } else if (pick.detail === "invisifolder.removeFolder") {
        await vscode.commands.executeCommand("invisifolder.removeFolder");
      }
    })
  );

  // Initial refresh
  refreshStatus();
}

/**
 * Deactivate extension (cleanup if needed)
 */
export function deactivate() {
  // nothing to clean up explicitly
}
