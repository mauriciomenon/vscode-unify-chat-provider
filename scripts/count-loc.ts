#!/usr/bin/env bun
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

/**
 * Excluded directories
 */
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'out-tests',
  'dist',
  '.vscode-test',
]);

/**
 * Included file extensions
 */
const INCLUDE_EXTS = new Set([
  '.ts',
  '.js',
  '.json',
  '.md',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.sh',
]);

interface FileStats {
  total: number;
  code: number;
  comment: number;
  blank: number;
  chars: number;
  size: number;
}

async function getFileStats(filePath: string): Promise<FileStats> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const fileStat = await stat(filePath);
    const lines = content.split('\n');

    let total = lines.length;
    let blank = 0;
    let comment = 0;
    let code = 0;
    let chars = content.length;

    let inBlockComment = false;
    const ext = extname(filePath);

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '') {
        blank++;
        continue;
      }

      // 简单的注释判断逻辑
      if (ext === '.ts' || ext === '.js' || ext === '.css' || ext === '.json') {
        if (inBlockComment) {
          comment++;
          if (trimmed.includes('*/')) {
            inBlockComment = false;
          }
          continue;
        }

        if (trimmed.startsWith('//')) {
          comment++;
        } else if (trimmed.startsWith('/*')) {
          comment++;
          if (!trimmed.includes('*/')) {
            inBlockComment = true;
          }
        } else {
          code++;
        }
      } else if (
        ext === '.yml' ||
        ext === '.yaml' ||
        ext === '.sh' ||
        filePath.endsWith('LICENSE')
      ) {
        if (trimmed.startsWith('#')) {
          comment++;
        } else {
          code++;
        }
      } else {
        // Markdown 或其他文件，默认都算作代码/内容
        code++;
      }
    }

    return {
      total,
      code,
      comment,
      blank,
      chars,
      size: fileStat.size,
    };
  } catch (e) {
    return { total: 0, code: 0, comment: 0, blank: 0, chars: 0, size: 0 };
  }
}

async function walk(dir: string, fileList: string[] = []): Promise<string[]> {
  const files = await readdir(dir);
  for (const file of files) {
    if (EXCLUDE_DIRS.has(file)) continue;

    const filePath = join(dir, file);
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      await walk(filePath, fileList);
    } else {
      if (file.endsWith('.d.ts')) continue;

      const ext = extname(file);
      if (INCLUDE_EXTS.has(ext) || file === 'LICENSE' || file.startsWith('.')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 计算字符串在终端中的视觉宽度
 */
function getVisualWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 简单判断是否为中文字符 (CJK)
    if (code >= 0x4e00 && code <= 0x9fff) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function visualPadEnd(str: string, width: number, char = ' '): string {
  const vWidth = getVisualWidth(str);
  return str + char.repeat(Math.max(0, width - vWidth));
}

function visualPadStart(str: string, width: number, char = ' '): string {
  const vWidth = getVisualWidth(str);
  return char.repeat(Math.max(0, width - vWidth)) + str;
}

async function main() {
  const rootDir = process.cwd();
  console.log(`\n🚀 Counting lines of code in: ${rootDir}`);

  const files = await walk(rootDir);

  const statsByExt: Record<string, { count: number } & FileStats> = {};
  const totalStats: { count: number } & FileStats = {
    count: 0,
    total: 0,
    code: 0,
    comment: 0,
    blank: 0,
    chars: 0,
    size: 0,
  };

  for (const file of files) {
    const stats = await getFileStats(file);
    const ext = extname(file) || (file.startsWith('.') ? 'hidden' : 'no-ext');

    if (!statsByExt[ext]) {
      statsByExt[ext] = {
        count: 0,
        total: 0,
        code: 0,
        comment: 0,
        blank: 0,
        chars: 0,
        size: 0,
      };
    }

    statsByExt[ext].count++;
    statsByExt[ext].total += stats.total;
    statsByExt[ext].code += stats.code;
    statsByExt[ext].comment += stats.comment;
    statsByExt[ext].blank += stats.blank;
    statsByExt[ext].chars += stats.chars;
    statsByExt[ext].size += stats.size;

    totalStats.count++;
    totalStats.total += stats.total;
    totalStats.code += stats.code;
    totalStats.comment += stats.comment;
    totalStats.blank += stats.blank;
    totalStats.chars += stats.chars;
    totalStats.size += stats.size;
  }

  const colWidths = {
    ext: 12,
    count: 8,
    total: 10,
    code: 10,
    comment: 10,
    blank: 10,
    chars: 12,
    size: 12,
  };

  const separator = '─'.repeat(
    Object.values(colWidths).reduce((a, b) => a + b, 0) +
      (Object.keys(colWidths).length - 1) * 3,
  );

  console.log('\n' + separator.replace(/─/g, '━'));
  console.log(
    `${visualPadEnd('Extension', colWidths.ext)} | ` +
      `${visualPadStart('Files', colWidths.count)} | ` +
      `${visualPadStart('Lines', colWidths.total)} | ` +
      `${visualPadStart('Code', colWidths.code)} | ` +
      `${visualPadStart('Comments', colWidths.comment)} | ` +
      `${visualPadStart('Blanks', colWidths.blank)} | ` +
      `${visualPadStart('Chars', colWidths.chars)} | ` +
      `${visualPadStart('Size', colWidths.size)}`,
  );
  console.log(separator);

  const sortedExts = Object.entries(statsByExt).sort(
    (a, b) => b[1].total - a[1].total,
  );

  for (const [ext, data] of sortedExts) {
    console.log(
      `${visualPadEnd(ext, colWidths.ext)} | ` +
        `${visualPadStart(data.count.toString(), colWidths.count)} | ` +
        `${visualPadStart(data.total.toString(), colWidths.total)} | ` +
        `${visualPadStart(data.code.toString(), colWidths.code)} | ` +
        `${visualPadStart(data.comment.toString(), colWidths.comment)} | ` +
        `${visualPadStart(data.blank.toString(), colWidths.blank)} | ` +
        `${visualPadStart(data.chars.toString(), colWidths.chars)} | ` +
        `${visualPadStart(formatSize(data.size), colWidths.size)}`,
    );
  }

  console.log(separator);
  console.log(
    `${visualPadEnd('Total', colWidths.ext)} | ` +
      `${visualPadStart(totalStats.count.toString(), colWidths.count)} | ` +
      `${visualPadStart(totalStats.total.toString(), colWidths.total)} | ` +
      `${visualPadStart(totalStats.code.toString(), colWidths.code)} | ` +
      `${visualPadStart(totalStats.comment.toString(), colWidths.comment)} | ` +
      `${visualPadStart(totalStats.blank.toString(), colWidths.blank)} | ` +
      `${visualPadStart(totalStats.chars.toString(), colWidths.chars)} | ` +
      `${visualPadStart(formatSize(totalStats.size), colWidths.size)}`,
  );
  console.log(separator.replace(/─/g, '━') + '\n');
}

main().catch((err) => {
  console.error('Failed to count LOC:', err);
  process.exit(1);
});
