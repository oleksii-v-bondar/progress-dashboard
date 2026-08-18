import { useState } from 'react';
import { ProgressBar } from '../components/ProgressBar';
import { TaskCard } from '../components/TaskCard';
import { AddTaskForm } from '../components/AddTaskForm';
import { useTasks } from '../hooks/useTasks';

interface AreaDetailViewProps {
  area: { id: string; name: string; color: string; skills: Array<{ id: string; name: string }> };
  areaProgress: { completed: number; total: number } | undefined;
  onCreateSkill: (areaId: string, name: string) => void;
  onDeleteSkill: (id: string) => void;
  onProgressChange: () => void;
}

export function AreaDetailView({ area, areaProgress, onCreateSkill, onDeleteSkill, onProgressChange }: AreaDetailViewProps) {
  const [newSkillName, setNewSkillName] = useState('');
  const { tasks, createTask, toggleComplete, deleteTask } = useTasks({ area_id: area.id });

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSkillName.trim()) {
      onCreateSkill(area.id, newSkillName.trim());
      setNewSkillName('');
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    await toggleComplete(id, completed);
    onProgressChange();
  };

  const handleDelete = async (id: string) => {
    await deleteTask(id);
    onProgressChange();
  };

  const handleCreateTask = async (data: { skill_id: string; name: string; description?: string; status: string }) => {
    await createTask(data);
    onProgressChange();
  };

  const progressPct = areaProgress && areaProgress.total > 0
    ? (areaProgress.completed / areaProgress.total) * 100
    : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: area.color }} />
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>{area.name}</h2>
      </div>

      {areaProgress && areaProgress.total > 0 && (
        <div style={{ marginBottom: 24 }}>
          <ProgressBar
            value={progressPct}
            color={area.color}
            label={`Today: ${areaProgress.completed}/${areaProgress.total} completed`}
          />
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Skills
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {area.skills.map(skill => (
            <span
              key={skill.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 16,
                background: area.color + '20',
                color: area.color,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {skill.name}
              <button
                onClick={() => onDeleteSkill(skill.id)}
                style={{ fontSize: 14, color: area.color, opacity: 0.6 }}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <form onSubmit={handleAddSkill} style={{ display: 'flex', gap: 8 }}>
          <input
            value={newSkillName}
            onChange={e => setNewSkillName(e.target.value)}
            placeholder="New skill name"
            style={{ fontSize: 13, flex: 1 }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: area.color,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Add Skill
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
          Tasks
        </h3>
        <AddTaskForm
          areas={[area]}
          defaultStatus="backlog"
          onAdd={handleCreateTask}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            {...task}
            onToggleComplete={handleToggle}
            onDelete={handleDelete}
          />
        ))}
        {tasks.length === 0 && (
          <p style={{ color: 'var(--text-muted)' }}>No tasks in this area yet.</p>
        )}
      </div>
    </div>
  );
}
