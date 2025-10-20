const fs = require('fs');
const path = require('path');

// Read tasks.json
const tasksPath = path.join(__dirname, '../.taskmaster/tasks/tasks.json');
const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));

// Get all tasks
const allTasks = tasksData.master?.tasks || tasksData.tasks || [];

// Generate task files for tasks 56-87
const missingTaskIds = [];
for (let i = 56; i <= 87; i++) {
  missingTaskIds.push(i);
}

missingTaskIds.forEach(taskId => {
  const task = allTasks.find(t => t.id === taskId);
  
  if (!task) {
    console.log(`Task ${taskId} not found in tasks.json`);
    return;
  }

  const taskFileName = `task_${String(taskId).padStart(3, '0')}.txt`;
  const taskFilePath = path.join(__dirname, '../.taskmaster/tasks', taskFileName);

  // Format dependencies
  const depsStr = task.dependencies && task.dependencies.length > 0 
    ? task.dependencies.join(', ') 
    : 'None';

  // Format status
  const statusStr = task.status || 'pending';

  // Format priority  
  const priorityStr = task.priority || 'medium';

  // Build file content
  let content = `# Task ID: ${task.id}\n`;
  content += `# Title: ${task.title}\n`;
  content += `# Status: ${statusStr}\n`;
  content += `# Dependencies: ${depsStr}\n`;
  content += `# Priority: ${priorityStr}\n`;
  content += `# Description: ${task.description || ''}\n`;
  
  if (task.details) {
    content += `# Details:\n${task.details}\n\n`;
  }
  
  if (task.testStrategy) {
    content += `# Test Strategy:\n${task.testStrategy}\n\n`;
  }

  // Write file
  fs.writeFileSync(taskFilePath, content, 'utf8');
  console.log(`Generated: ${taskFileName}`);
});

console.log(`\n✅ Generated ${missingTaskIds.length} task files`);

