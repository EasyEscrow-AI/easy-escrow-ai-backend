#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

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

function formatStatus(status: string): string {
  const statusMap: { [key: string]: string } = {
    'pending': '⏳ Pending',
    'in_progress': '🔄 In Progress',
    'completed': '✅ Completed',
    'cancelled': '❌ Cancelled'
  };
  return statusMap[status] || status;
}

function formatPriority(priority: number): string {
  if (priority <= 2) return '🔴 High';
  if (priority <= 4) return '🟡 Medium';
  return '🟢 Low';
}

function main() {
  const { tasks } = loadTasks();
  
  console.log('\n📋 EasyEscrow.ai Backend Tasks\n');
  console.log('=' .repeat(80));
  
  // Group tasks by status
  const groupedTasks = tasks.reduce((acc, task) => {
    if (!acc[task.status]) acc[task.status] = [];
    acc[task.status].push(task);
    return acc;
  }, {} as { [key: string]: Task[] });
  
  // Display tasks by status
  const statusOrder = ['in_progress', 'pending', 'completed', 'cancelled'];
  
  statusOrder.forEach(status => {
    if (groupedTasks[status] && groupedTasks[status].length > 0) {
      console.log(`\n${formatStatus(status)} (${groupedTasks[status].length} tasks)`);
      console.log('-'.repeat(50));
      
      groupedTasks[status]
        .sort((a, b) => a.priority - b.priority)
        .forEach(task => {
          console.log(`\n${task.id}`);
          console.log(`  Title: ${task.title}`);
          console.log(`  Priority: ${formatPriority(task.priority)}`);
          console.log(`  Estimated: ${task.estimated_hours}h`);
          console.log(`  Tags: ${task.tags.join(', ')}`);
          if (task.dependencies.length > 0) {
            console.log(`  Dependencies: ${task.dependencies.join(', ')}`);
          }
          if (task.description) {
            console.log(`  Description: ${task.description}`);
          }
        });
    }
  });
  
  // Summary
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  
  console.log('\n' + '='.repeat(80));
  console.log(`📊 Summary: ${completedTasks}/${totalTasks} completed, ${inProgressTasks} in progress, ${pendingTasks} pending`);
  console.log('='.repeat(80) + '\n');
}

if (require.main === module) {
  main();
}