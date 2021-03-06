import axios from "axios";
import * as moment from "moment";
import * as path from "path";
import {
  commands,
  TextDocument,
  Uri,
  ViewColumn,
  window,
  workspace
} from "vscode";
import { closeWebviewPanel, openPlayground } from "./commands/playground";
import { FS_SCHEME, PLAYGROUND_JSON_FILE } from "./constants";
import { Gist, GistFile, SortOrder, store } from "./store";
import { getGist } from "./store/actions";

export function fileNameToUri(gistId: string, filename: string): Uri {
  return Uri.parse(`${FS_SCHEME}://${gistId}/${encodeURIComponent(filename)}`);
}

export async function closeGistFiles(gist: Gist) {
  window.visibleTextEditors.forEach((editor) => {
    if (
      editor.document.uri.scheme === FS_SCHEME &&
      editor.document.uri.authority === gist.id
    ) {
      editor.hide();
    }
  });

  if (isPlaygroundGist(gist)) {
    closeWebviewPanel(gist.id);
  }
}

export async function getFileContents(file: GistFile) {
  if (file.truncated || !file.content) {
    const responseType = file.type!.startsWith("image/")
      ? "arraybuffer"
      : "text";
    file.content = (
      await axios.get(file.raw_url!, {
        responseType,
        transformResponse: (data) => {
          return data;
        }
      })
    ).data;
  }

  return file.content!;
}

export function getGistDetailsFromUri(uri: Uri) {
  return {
    gistId: uri.authority,
    file: decodeURIComponent(path.basename(uri.path))
  };
}

export function getGistDescription(gist: Gist): string {
  return `${moment(gist.updated_at).calendar()}${
    gist.public ? "" : " (Secret)"
  }`;
}

export function getGistLabel(gist: Gist): string {
  return gist.description || `${Object.keys(gist.files)[0]}`;
}

export function getGistWorkspaceId() {
  return workspace.workspaceFolders![0].uri.authority;
}

export function getStarredGistLabel(gist: Gist) {
  const suffix = gist.public ? "" : " 🔒";
  return `${gist.owner.login} / ${Object.keys(gist.files)[0]}${suffix}`;
}

export function isGistDocument(document: TextDocument) {
  return document.uri.scheme === FS_SCHEME;
}

export function isGistWorkspace() {
  return (
    workspace.workspaceFolders &&
    workspace.workspaceFolders[0].uri.scheme === FS_SCHEME
  );
}

export function isNotebookGist(gist: Gist) {
  return Object.keys(gist.files).some((file) => file.endsWith("ipynb"));
}

export function isPlaygroundGist(gist: Gist) {
  const gistFiles = Object.keys(gist.files);
  return (
    gistFiles.includes(PLAYGROUND_JSON_FILE) || gistFiles.includes("index.html")
  );
}

export async function openGist(id: string, isNew: boolean = false) {
  const gist = await getGist(id);

  if (isPlaygroundGist(gist)) {
    await openPlayground(gist);
  } else {
    Object.entries(gist.files)
      .reverse()
      .forEach(async ([_, file], index) => {
        const uri = fileNameToUri(id, file.filename!);

        //if (!isNew && path.extname(file.filename!) === ".md") {
        //  commands.executeCommand("markdown.showPreview", uri);
        //} else {
        // TODO: Improve the view column arrangement for more than 2 files
        await window.showTextDocument(uri, {
          preview: false,
          viewColumn: ViewColumn.Beside
        });
        //}
      });
  }
}

export async function openGistFile(uri: Uri, allowPreview: boolean = true) {
  const extension = path
    .extname(uri.toString())
    .toLocaleLowerCase()
    .substr(1);

  let commandName = "vscode.open";

  if (allowPreview) {
    switch (extension) {
      case "md":
        commandName = "markdown.showPreview";
        break;
      //case "ipynb":
      //  commandName = "python.datascience.opennotebook";
      //  break;
    }
  }

  commands.executeCommand(commandName, uri);
}

export function openGistAsWorkspace(id: string) {
  // TODO: Add support for adding the Gist as a new
  // root to an existing workspace
  const uri = Uri.parse(`${FS_SCHEME}://${id}/`);
  commands.executeCommand("vscode.openFolder", uri, false);
}

export function sortGists(gists: Gist[]) {
  if (store.sortOrder === SortOrder.alphabetical) {
    return gists.sort((a, b) => getGistLabel(a).localeCompare(getGistLabel(b)));
  } else {
    return gists.sort(
      (a, b) =>
        Date.parse(b.updated_at || b.created_at) -
        Date.parse(a.updated_at || a.created_at)
    );
  }
}

export function uriToFileName(uri: Uri): string {
  return decodeURIComponent(path.basename(uri.toString()));
}
