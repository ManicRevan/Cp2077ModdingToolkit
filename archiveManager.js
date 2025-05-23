import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import https from 'https';

const TOOLS_DIR = path.join(__dirname, 'tools');
const CP77TOOLS_DIR = path.join(TOOLS_DIR, 'cp77tools');
const CP77TOOLS_EXE = path.join(CP77TOOLS_DIR, 'cp77tools.exe');
const CP77TOOLS_URL = 'https://github.com/rfuzzo/cp77tools/releases/latest/download/cp77tools.exe';

export function ensureCp77toolsExists(callback) {
    if (fs.existsSync(CP77TOOLS_EXE)) {
        callback();
        return;
    }
    if (!fs.existsSync(CP77TOOLS_DIR)) fs.mkdirSync(CP77TOOLS_DIR, { recursive: true });
    const file = fs.createWriteStream(CP77TOOLS_EXE);
    https.get(CP77TOOLS_URL, (response) => {
        if (response.statusCode !== 200) {
            callback(new Error('Failed to download cp77tools: ' + response.statusCode));
            return;
        }
        response.pipe(file);
        file.on('finish', () => {
            file.close(callback);
        });
    }).on('error', (err) => {
        fs.unlinkSync(CP77TOOLS_EXE);
        callback(err);
    });
}

export function extractArchive(archivePath, outputDir, onProgress, onDone) {
    ensureCp77toolsExists((err) => {
        if (err) return onDone(err);
        const args = ['-e', archivePath, '-o', outputDir];
        const proc = spawn(CP77TOOLS_EXE, args);
        proc.stdout.on('data', (data) => {
            if (onProgress) onProgress(data.toString());
        });
        proc.stderr.on('data', (data) => {
            if (onProgress) onProgress(data.toString());
        });
        proc.on('close', (code) => {
            if (code !== 0) return onDone(new Error('cp77tools exited with code ' + code));
            onDone();
        });
    });
}

export function packArchive(inputDir, archivePath, onProgress, onDone) {
    ensureCp77toolsExists((err) => {
        if (err) return onDone(err);
        const args = ['-c', inputDir, '-o', archivePath];
        const proc = spawn(CP77TOOLS_EXE, args);
        proc.stdout.on('data', (data) => {
            if (onProgress) onProgress(data.toString());
        });
        proc.stderr.on('data', (data) => {
            if (onProgress) onProgress(data.toString());
        });
        proc.on('close', (code) => {
            if (code !== 0) return onDone(new Error('cp77tools exited with code ' + code));
            onDone();
        });
    });
} 