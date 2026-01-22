/**
 * ファイル操作のIPCハンドラ
 */
import { ipcMain, dialog } from 'electron';
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { dirname, join } from 'path';
import type { BoardData } from '@shared/types';
import type { BoardInfo } from '@shared/ipc';
import { getSettings, saveSettings } from './settingsHandlers';

/**
 * ファイル操作関連のIPCハンドラを登録する
 */
export function registerFileHandlers(): void {
  // ボード一覧を取得
  ipcMain.handle('get-board-list', async () => {
    const settings = await getSettings();
    if (!settings.parentFolderPath) {
      return [];
    }
    return getBoardListFromFolder(settings.parentFolderPath);
  });

  // 親フォルダを選択
  ipcMain.handle('select-parent-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'ボード管理用の親フォルダを選択'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folderPath = result.filePaths[0];
    const settings = await getSettings();
    await saveSettings({ ...settings, parentFolderPath: folderPath });
    return folderPath;
  });
  // ボードを開く
  ipcMain.handle('open-board', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'ボードを開く'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const dirPath = result.filePaths[0];
    return loadBoardFromDirectory(dirPath);
  });

  // ボードを保存
  ipcMain.handle('save-board', async (_, data: BoardData, filePath?: string) => {
    let dirPath = filePath;

    if (!dirPath) {
      // 親フォルダ内に自動保存
      const settings = await getSettings();
      if (settings.parentFolderPath) {
        // ボードタイトルをサニタイズしてフォルダ名に使用
        const sanitizedTitle = data.board.title
          .replace(/[/\\?%*:|"<>]/g, '-')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        dirPath = join(settings.parentFolderPath, `${sanitizedTitle}_${Date.now()}`);
      } else {
        // 親フォルダ未設定の場合はダイアログ表示
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: '保存先フォルダを選択'
        });

        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }
        dirPath = result.filePaths[0];
      }
    }

    await saveBoardToDirectory(data, dirPath);
    return dirPath;
  });

  // 指定パスからボードを読み込み
  ipcMain.handle('load-board-from-path', async (_, filePath: string) => {
    return loadBoardFromDirectory(filePath);
  });

  // 保存ダイアログを表示
  ipcMain.handle('show-save-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '保存先フォルダを選択'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 開くダイアログを表示
  ipcMain.handle('show-open-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'ボードを開く'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

/**
 * ディレクトリからボードデータを読み込む
 */
async function loadBoardFromDirectory(dirPath: string): Promise<BoardData | null> {
  try {
    const boardJson = await readFile(join(dirPath, 'board.json'), 'utf-8');
    const nodesJson = await readFile(join(dirPath, 'nodes.json'), 'utf-8');
    
    let summaries: any[] = [];
    try {
      const summariesJson = await readFile(join(dirPath, 'summaries.json'), 'utf-8');
      summaries = JSON.parse(summariesJson);
    } catch {
      // summaries.jsonがなくてもOK
    }

    return {
      board: JSON.parse(boardJson),
      nodes: JSON.parse(nodesJson),
      summaries
    };
  } catch (error) {
    console.error('Failed to load board:', error);
    return null;
  }
}

/**
 * ボードデータをディレクトリに保存する
 */
async function saveBoardToDirectory(data: BoardData, dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });

  await writeFile(
    join(dirPath, 'board.json'),
    JSON.stringify(data.board, null, 2),
    'utf-8'
  );

  await writeFile(
    join(dirPath, 'nodes.json'),
    JSON.stringify(data.nodes, null, 2),
    'utf-8'
  );

  await writeFile(
    join(dirPath, 'summaries.json'),
    JSON.stringify(data.summaries, null, 2),
    'utf-8'
  );
}

/**
 * 親フォルダ内のボード一覧を取得する
 */
async function getBoardListFromFolder(parentPath: string): Promise<BoardInfo[]> {
  const boardList: BoardInfo[] = [];

  try {
    const entries = await readdir(parentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderPath = join(parentPath, entry.name);
      const boardJsonPath = join(folderPath, 'board.json');

      try {
        const boardJson = await readFile(boardJsonPath, 'utf-8');
        const board = JSON.parse(boardJson);
        
        boardList.push({
          id: board.id,
          title: board.title,
          description: board.description,
          folderPath,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt
        });
      } catch {
        // board.jsonが存在しないか無効なディレクトリはスキップ
        continue;
      }
    }
  } catch (error) {
    console.error('Failed to get board list:', error);
  }

  return boardList.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
