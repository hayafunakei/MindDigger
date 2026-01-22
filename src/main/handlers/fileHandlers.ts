/**
 * ファイル操作のIPCハンドラ
 */
import { ipcMain, dialog } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { BoardData } from '@shared/types';

/**
 * ファイル操作関連のIPCハンドラを登録する
 */
export function registerFileHandlers(): void {
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
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: '保存先フォルダを選択'
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      dirPath = result.filePaths[0];
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
