import { execGitCredentialFill } from "@abstractions/gitCredentialFill";
import * as keytarType from "keytar";
import { commands, env, window } from "vscode";
import { store } from ".";
import * as config from "../config";
import { EXTENSION_ID } from "../constants";
import { getGistWorkspaceId, isGistWorkspace, openGist } from "../utils";
import { refreshGists } from "./actions";

const GitHub = require("github-base");

export function getCurrentUser() {
  return store.login;
}

export type Keytar = {
  getPassword: typeof keytarType["getPassword"];
  setPassword: typeof keytarType["setPassword"];
  deletePassword: typeof keytarType["deletePassword"];
};

function getNativeKeytar(): Keytar {
  const vscodeRequire = eval("require");
  return vscodeRequire("keytar");
}

const keytar = getNativeKeytar();

const ACCOUNT = "gist-token";
const SERVICE = `vscode-${EXTENSION_ID}`;

const STATE_CONTEXT_KEY = `${EXTENSION_ID}:state`;
const STATE_SIGNED_IN = "SignedIn";
const STATE_SIGNED_OUT = "SignedOut";

const SCOPE_HEADER = "x-oauth-scopes";
const GIST_SCOPE = "gist";

async function testToken(token: string) {
  const apiurl = await config.get("apiUrl");
  const github = new GitHub({ apiurl, token });
  try {
    const response = await github.get("/user");
    const scopeHeaderIndex = response.rawHeaders.findIndex(
      (item: string) => item.toLowerCase() === SCOPE_HEADER
    );
    if (scopeHeaderIndex === -1) {
      return false;
    }

    const tokenScopes = response.rawHeaders[scopeHeaderIndex + 1];
    if (!tokenScopes.includes(GIST_SCOPE)) {
      return false;
    }

    store.login = response.body.login;
    return true;
  } catch (e) {
    return false;
  }
}

// TODO: Support SSO when using username and password vs. just a token
async function attemptGitLogin(): Promise<boolean> {
  const gitSSO = await config.get("gitSSO");
  if (!gitSSO) {
    return false;
  }

  try {
    const token = execGitCredentialFill();
    if (token && token.length > 0 && (await testToken(token))) {
      await keytar.setPassword(SERVICE, ACCOUNT, token);
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

const TOKEN_RESPONSE = "Enter token";
export async function ensureAuthenticated() {
  const password = await getToken();
  if (password) {
    return;
  }

  const response = await window.showErrorMessage(
    "You need to sign-in with GitHub to perform this operation.",
    TOKEN_RESPONSE
  );
  if (response === TOKEN_RESPONSE) {
    await signIn();
  }
}

async function deleteToken() {
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

export async function getToken() {
  const token = await keytar.getPassword(SERVICE, ACCOUNT);
  return token;
}

export async function initializeAuth() {
  markUserAsSignedOut();

  const isSignedIn = await isAuthenticated();
  if (isSignedIn) {
    const currentToken = (await getToken())!;
    const tokenStillValid = await testToken(currentToken);
    if (!tokenStillValid) {
      await deleteToken();
      return;
    }
  } else {
    const gitSSO = await attemptGitLogin();
    if (!gitSSO) {
      return;
    }
  }

  await markUserAsSignedIn();
}

export async function isAuthenticated() {
  const token = await getToken();
  return token !== null;
}

async function markUserAsSignedIn() {
  store.isSignedIn = true;
  commands.executeCommand("setContext", STATE_CONTEXT_KEY, STATE_SIGNED_IN);
  await refreshGists();

  if (isGistWorkspace()) {
    const gistId = getGistWorkspaceId();
    openGist(gistId, false);
  }
}

function markUserAsSignedOut() {
  store.login = "";
  store.isSignedIn = false;
  commands.executeCommand("setContext", STATE_CONTEXT_KEY, STATE_SIGNED_OUT);
}

export async function signIn() {
  const value = await env.clipboard.readText();
  const token = await window.showInputBox({
    prompt: "Enter your GitHub token",
    value
  });
  if (token) {
    if (await testToken(token)) {
      await keytar.setPassword(SERVICE, ACCOUNT, token);
      await markUserAsSignedIn();
    } else {
      window.showErrorMessage(
        "The specified token isn't valid or doesn't inlcude the gist scope. Please check it and try again."
      );
    }
  }
}

export async function signout() {
  await deleteToken();
  markUserAsSignedOut();
}
