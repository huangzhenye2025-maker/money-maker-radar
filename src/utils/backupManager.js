const fs = require('fs');
const path = require('path');

class BackupManager {
  constructor() {
    this.rootDir = path.resolve(__dirname, '../../');
    this.backupsDir = path.join(this.rootDir, 'data/backups');
  }

  // 递归复制文件夹
  _copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this._copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 确保备份目录存在
  _ensureBackupsDir() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  // 格式化日期字符串
  _getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  // 获取备份的大小（字节）
  _getFolderSize(folderPath) {
    let totalSize = 0;
    try {
      if (!fs.existsSync(folderPath)) return 0;
      const stats = fs.statSync(folderPath);
      if (stats.isFile()) return stats.size;

      const files = fs.readdirSync(folderPath);
      for (const file of files) {
        totalSize += this._getFolderSize(path.join(folderPath, file));
      }
    } catch (e) {
      // 忽略部分错误
    }
    return totalSize;
  }

  // 列出所有可用备份
  listBackups() {
    this._ensureBackupsDir();
    try {
      const items = fs.readdirSync(this.backupsDir);
      const backups = [];

      for (const item of items) {
        const fullPath = path.join(this.backupsDir, item);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory() && (item.startsWith('backup_') || item.startsWith('safety_backup_'))) {
          // 计算该备份目录的文件总大小
          const sizeBytes = this._getFolderSize(fullPath);
          
          // 解析时间戳
          let timeStr = item.replace('backup_', '').replace('safety_backup_before_rollback_', '');
          let formattedTime = '未知时间';
          if (timeStr.length >= 15) {
            const y = timeStr.substring(0, 4);
            const mo = timeStr.substring(4, 6);
            const d = timeStr.substring(6, 8);
            const h = timeStr.substring(9, 11);
            const mi = timeStr.substring(11, 13);
            const s = timeStr.substring(13, 15);
            formattedTime = `${y}-${mo}-${d} ${h}:${mi}:${s}`;
          }

          backups.push({
            id: item,
            name: item,
            isSafety: item.startsWith('safety_backup_'),
            time: formattedTime,
            size: (sizeBytes / 1024 / 1024).toFixed(2) + ' MB',
            sizeBytes: sizeBytes,
            createdTimeMs: stats.birthtimeMs || stats.mtimeMs
          });
        }
      }

      // 按时间降序排列 (最新的在最前)
      return backups.sort((a, b) => b.createdTimeMs - a.createdTimeMs);
    } catch (err) {
      console.error('列出备份失败:', err);
      throw err;
    }
  }

  // 创建新备份
  createBackup(isSafety = false) {
    this._ensureBackupsDir();
    const timestamp = this._getFormattedDate();
    const backupName = isSafety 
      ? `safety_backup_before_rollback_${timestamp}`
      : `backup_${timestamp}`;
    
    const targetBackupDir = path.join(this.backupsDir, backupName);

    try {
      console.log(`【版本备份】正在创建备份: ${backupName}...`);
      fs.mkdirSync(targetBackupDir, { recursive: true });

      // 备份 src
      const srcPath = path.join(this.rootDir, 'src');
      if (fs.existsSync(srcPath)) {
        this._copyDirRecursive(srcPath, path.join(targetBackupDir, 'src'));
      }

      // 备份 public
      const publicPath = path.join(this.rootDir, 'public');
      if (fs.existsSync(publicPath)) {
        this._copyDirRecursive(publicPath, path.join(targetBackupDir, 'public'));
      }

      // 备份 package.json
      const pkgPath = path.join(this.rootDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        fs.copyFileSync(pkgPath, path.join(targetBackupDir, 'package.json'));
      }

      // 备份 .env
      const envPath = path.join(this.rootDir, '.env');
      if (fs.existsSync(envPath)) {
        fs.copyFileSync(envPath, path.join(targetBackupDir, '.env'));
      }

      // 备份 SQLite 数据库
      const dbPath = path.join(this.rootDir, 'data/github_trending.db');
      if (fs.existsSync(dbPath)) {
        // 创建数据库备份子文件夹
        fs.mkdirSync(path.join(targetBackupDir, 'database'), { recursive: true });
        fs.copyFileSync(dbPath, path.join(targetBackupDir, 'database/github_trending.db'));
      }

      console.log(`【版本备份】备份完成，保存在: ${targetBackupDir}`);
      return { success: true, name: backupName };
    } catch (err) {
      console.error(`【版本备份】备份失败:`, err);
      // 清理失败的文件夹
      if (fs.existsSync(targetBackupDir)) {
        fs.rmSync(targetBackupDir, { recursive: true, force: true });
      }
      throw err;
    }
  }

  // 执行回滚 (传入备份的 id 文件夹名称)
  rollback(backupId, dbConnectionCloser) {
    this._ensureBackupsDir();
    const backupSourceDir = path.join(this.backupsDir, backupId);

    if (!fs.existsSync(backupSourceDir)) {
      throw new Error(`未找到备份包: ${backupId}`);
    }

    try {
      console.log(`【版本回滚】准备回滚到版本: ${backupId}...`);

      // 1. 回滚前强制自动备份当前现状，作为“后悔药”
      const safetyBackupResult = this.createBackup(true);
      console.log(`【版本回滚】当前状态已成功备份为安全防线: ${safetyBackupResult.name}`);

      // 2. 如果提供了 dbConnectionCloser，关闭当前的数据库连接，防止 Windows 下锁文件
      if (dbConnectionCloser && typeof dbConnectionCloser === 'function') {
        console.log('【版本回滚】正在关闭数据库连接以解除锁定...');
        dbConnectionCloser();
      }

      // 给数据库解锁稍留时间
      const sleep = (ms) => {
        const start = Date.now();
        while (Date.now() - start < ms) {}
      };
      sleep(100);

      // 3. 安全清理现存文件（千万不能把 node_modules 和 data/backups 删了！）
      console.log('【版本回滚】正在安全清理现有运行文件...');
      
      const srcDir = path.join(this.rootDir, 'src');
      if (fs.existsSync(srcDir)) {
        fs.rmSync(srcDir, { recursive: true, force: true });
      }

      const publicDir = path.join(this.rootDir, 'public');
      if (fs.existsSync(publicDir)) {
        fs.rmSync(publicDir, { recursive: true, force: true });
      }

      const envFile = path.join(this.rootDir, '.env');
      if (fs.existsSync(envFile)) {
        fs.rmSync(envFile, { force: true });
      }

      const pkgFile = path.join(this.rootDir, 'package.json');
      if (fs.existsSync(pkgFile)) {
        fs.rmSync(pkgFile, { force: true });
      }

      const dbFile = path.join(this.rootDir, 'data/github_trending.db');
      if (fs.existsSync(dbFile)) {
        fs.rmSync(dbFile, { force: true });
      }

      // 4. 将备份文件夹中的数据还原回根目录
      console.log('【版本回滚】正在释放备份数据，还原系统...');
      
      // 还原 src
      const backupSrc = path.join(backupSourceDir, 'src');
      if (fs.existsSync(backupSrc)) {
        this._copyDirRecursive(backupSrc, path.join(this.rootDir, 'src'));
      }

      // 还原 public
      const backupPublic = path.join(backupSourceDir, 'public');
      if (fs.existsSync(backupPublic)) {
        this._copyDirRecursive(backupPublic, path.join(this.rootDir, 'public'));
      }

      // 还原 package.json
      const backupPkg = path.join(backupSourceDir, 'package.json');
      if (fs.existsSync(backupPkg)) {
        fs.copyFileSync(backupPkg, path.join(this.rootDir, 'package.json'));
      }

      // 还原 .env
      const backupEnv = path.join(backupSourceDir, '.env');
      if (fs.existsSync(backupEnv)) {
        fs.copyFileSync(backupEnv, path.join(this.rootDir, '.env'));
      }

      // 还原 数据库
      const backupDb = path.join(backupSourceDir, 'database/github_trending.db');
      if (fs.existsSync(backupDb)) {
        // 确保 data 目录存在
        fs.mkdirSync(path.join(this.rootDir, 'data'), { recursive: true });
        fs.copyFileSync(backupDb, path.join(this.rootDir, 'data/github_trending.db'));
      }

      console.log(`【版本回滚】回滚释放完毕！版本已被恢复为 ${backupId}。`);
      return { success: true };
    } catch (err) {
      console.error(`【版本回滚】回滚失败:`, err);
      throw err;
    }
  }

  // 删除某备份
  deleteBackup(backupId) {
    this._ensureBackupsDir();
    const backupDir = path.join(this.backupsDir, backupId);
    if (!fs.existsSync(backupDir)) {
      throw new Error(`未找到备份包: ${backupId}`);
    }
    try {
      console.log(`【版本备份】删除备份: ${backupId}`);
      fs.rmSync(backupDir, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      console.error(`【版本备份】删除失败:`, err);
      throw err;
    }
  }
}

module.exports = new BackupManager();
