import { reaction } from "mobx";
import { commands, ExtensionContext } from "vscode";
import { SortOrder, store } from ".";

const FOLLOW_KEY = "gistpad.followedUsers";
const SORT_ORDER_KEY = "gistpad:sortOrder";

export interface IStorage {
  followedUsers: string[];
}

function updateSortOrder(context: ExtensionContext, sortOrder: SortOrder) {
  context.globalState.update(SORT_ORDER_KEY, sortOrder);
  commands.executeCommand("setContext", SORT_ORDER_KEY, sortOrder);
}

export let storage: IStorage;
export function initializeStorage(context: ExtensionContext) {
  storage = {
    get followedUsers() {
      return context.globalState.get<string[]>(FOLLOW_KEY, []).sort();
    },
    set followedUsers(followedUsers: string[]) {
      context.globalState.update(FOLLOW_KEY, followedUsers);
    }
  };

  const sortOrder = context.globalState.get(
    SORT_ORDER_KEY,
    SortOrder.updatedTime
  );

  store.sortOrder = sortOrder;
  commands.executeCommand("setContext", SORT_ORDER_KEY, sortOrder);

  reaction(
    () => [store.sortOrder],
    () => updateSortOrder(context, store.sortOrder)
  );
}
