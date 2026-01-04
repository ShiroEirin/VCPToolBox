#!/usr/bin/env node
import axios from "axios";
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadAudio(url, title, taskId) {
    // 1. Global Hard Timeout (5 minutes) to prevent zombie processes
    const GLOBAL_TIMEOUT = 5 * 60 * 1000;
    const timeoutTimer = setTimeout(() => {
        console.error(`[Downloader] Task ${taskId} timed out after ${GLOBAL_TIMEOUT}ms. Force exiting.`);
        process.exit(1);
    }, GLOBAL_TIMEOUT);

    try {
        const musicDir = path.resolve(__dirname, '..', '..', 'file', 'music');
        await fsp.mkdir(musicDir, { recursive: true });

        const safeTitle = (title || `suno_song_${taskId}`).replace(/[^a-z0-9\u4e00-\u9fa5\-_.]/gi, '_').replace(/ /g, '_');
        const filename = `${safeTitle}.mp3`;
        const filepath = path.join(musicDir, filename);

        // 2. Streamed Download with Axios timeout
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 30000, // 30 seconds connection timeout
        });

        // 3. Pipeline for memory-safe streaming
        const writer = createWriteStream(filepath);
        await pipeline(response.data, writer);

        console.log(`[Downloader] Successfully downloaded: ${filepath}`);
        clearTimeout(timeoutTimer);
        process.exit(0); // Explicit success exit
    } catch (error) {
        console.error(`[Downloader] Failed to download audio file for task ${taskId}: ${error.message}`);
        clearTimeout(timeoutTimer);
        process.exit(1); // Explicit failure exit
    }
}

// Get arguments from command line
const [url, title, taskId] = process.argv.slice(2);

if (!url || !taskId) {
    console.error("Usage: node Downloader.mjs <url> <title> <taskId>");
    process.exit(1);
}

downloadAudio(url, title, taskId);
