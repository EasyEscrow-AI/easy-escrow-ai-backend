#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: number;
  dependencies: string[];
  estimated_hours: number;
  tags: string[];
}

interface TaskData {
  tasks: Task[];
}

function loadTasks(): TaskData {
  const tasksPath = path.join(__dirname, '..', '.taskmaster', 'tasks.json');
  try {
    const data = fs.readFileSync(tasksPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading tasks:', error);
    process.exit(1);
  }
}

function saveTasks(tasks: TaskData): void {
  const tasksPath = path.join(__dirname, '..', '.taskmaster', 'tasks.json');
  try {
    fs.writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
  } catch (error) {
    console.error('Error saving tasks:', error);
    process.exit(1);
  }
}

function updateTaskStatus(taskId: string, status: Task['status']): void {
  const taskData = loadTasks();
  const task = taskData.tasks.find(t => t.id === taskId);
  
  if (!task) {
    console.error(`Task with id "${taskId}" not found`);
    process.exit(1);
  }
  
  task.status = status;
  saveTasks(taskData);
  console.log(`✅ Task "${taskId}" status updated to "${status}"`);
}

function getNextTask(): Task | null {
  const taskData = loadTasks();
  
  // Find tasks that are pending and have all dependencies completed
  const availableTasks = taskData.tasks.filter(task => {
    if (task.status !== 'pending') return false;
    
    // Check if all dependencies are completed
    return task.dependencies.every(depId => {
      const depTask = taskData.tasks.find(t => t.id === depId);
      return depTask?.status === 'completed';
    });
  });
  
  if (availableTasks.length === 0) {
    return null;
  }
  
  // Return the highest priority task
  return availableTasks.sort((a, b) => a.priority - b.priority)[0];
}

function executeTask(task: Task): void {
  console.log(`\n🚀 Starting task: ${task.title}`);
  console.log(`📝 Description: ${task.description}`);
  console.log(`⏱️  Estimated time: ${task.estimated_hours} hours`);
  console.log(`🏷️  Tags: ${task.tags.join(', ')}`);
  console.log('\n' + '='.repeat(60));
  
  // Update task status to in_progress
  updateTaskStatus(task.id, 'in_progress');
  
  // Here you would implement the actual task execution logic
  // For now, we'll just simulate the task execution
  console.log(`\n⚡ Executing task logic for: ${task.id}`);
  
  // This is where you would add specific task execution logic
  // based on the task ID or tags
  switch (task.id) {
    case 'setup-project-structure':
      console.log('Setting up Node.js/TypeScript project structure...');
      console.log('✅ Project structure setup completed');
      break;
    case 'create-database-schema':
      console.log('Creating PostgreSQL database schema...');
      console.log('✅ Database schema created');
      break;
    case 'develop-solana-program':
      console.log('Developing Solana escrow program...');
      console.log('✅ Solana program developed');
      break;
    case 'build-api-endpoints':
      console.log('Building RESTful API endpoints...');
      console.log('✅ API endpoints built');
      break;
    case 'implement-monitoring':
      console.log('Implementing on-chain monitoring and settlement engine...');
      console.log('✅ Monitoring system implemented');
      break;
    case 'setup-webhooks':
      console.log('Setting up webhook system...');
      console.log('✅ Webhook system setup');
      break;
    case 'create-tests':
      console.log('Creating comprehensive test suite...');
      console.log('✅ Test suite created');
      break;
    case 'setup-deployment':
      console.log('Setting up deployment infrastructure...');
      console.log('✅ Deployment infrastructure setup');
      break;
    default:
      console.log(`No specific execution logic defined for task: ${task.id}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ Task "${task.id}" completed successfully!`);
  
  // Update task status to completed
  updateTaskStatus(task.id, 'completed');
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Run the next available task
    const nextTask = getNextTask();
    
    if (!nextTask) {
      console.log('🎉 No pending tasks available! All tasks are completed or in progress.');
      process.exit(0);
    }
    
    executeTask(nextTask);
  } else if (args[0] === 'complete' && args[1]) {
    // Mark a specific task as completed
    updateTaskStatus(args[1], 'completed');
  } else if (args[0] === 'start' && args[1]) {
    // Start a specific task
    const taskData = loadTasks();
    const task = taskData.tasks.find(t => t.id === args[1]);
    
    if (!task) {
      console.error(`Task with id "${args[1]}" not found`);
      process.exit(1);
    }
    
    executeTask(task);
  } else {
    console.log('Usage:');
    console.log('  npm run task:run                    # Run the next available task');
    console.log('  npm run task:run start <task-id>    # Start a specific task');
    console.log('  npm run task:run complete <task-id> # Mark a task as completed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}