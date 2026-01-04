const fs = require('fs').promises;
const path = require('path');

// 引用 ScheduleManager 的数据文件
const SCHEDULE_FILE = path.join(__dirname, '..', 'ScheduleManager', 'schedules.json');

async function readSchedules() {
    try {
        const data = await fs.readFile(SCHEDULE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function writeSchedules(schedules) {
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
}

async function main() {
    try {
        let schedules = await readSchedules();
        const now = new Date();

        // 1. 清理过期日程 (假设 time 格式可以被 Date 解析)
        const initialCount = schedules.length;
        schedules = schedules.filter(s => {
            const scheduleTime = new Date(s.time);
            // 如果解析失败，保留该日程以免误删
            if (isNaN(scheduleTime.getTime())) return true;
            // 保留未来的日程（或者还没过期的日程）
            return scheduleTime > now;
        });

        if (schedules.length !== initialCount) {
            await writeSchedules(schedules);
        }

        // 2. 找到下一个日程
        if (schedules.length === 0) {
            console.log("用户目前没有待办日程。");
        } else {
            // 按时间排序
            schedules.sort((a, b) => new Date(a.time) - new Date(b.time));
            const next = schedules[0];
            console.log(`用户的下一个日程是：${next.time} - ${next.content}`);
        }
    } catch (error) {
        console.error(`[ScheduleBriefing] Error: ${error.message}`);
    }
}

main();