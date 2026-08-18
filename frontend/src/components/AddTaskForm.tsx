import { useState } from 'react';

interface AddTaskFormProps {
  areas: Array<{ id: string; name: string; color: string; skills: Array<{ id: string; name: string }> }>;
  defaultStatus: string;
  onAdd: (data: { skill_id: string; name: string; description?: string; status: string }) => void;
}

export function AddTaskForm({ areas, defaultStatus, onAdd }: AddTaskFormProps) {
  const [name, setName] = useState('');
  const [skillId, setSkillId] = useState('');
  const [description, setDescription] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && skillId) {
      onAdd({ skill_id: skillId, name: name.trim(), description: description.trim() || undefined, status: defaultStatus });
      setName('');
      setDescription('');
      setExpanded(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          color: 'var(--text-muted)',
          fontSize: 14,
          width: '100%',
        }}
      >
        + Add task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        borderRadius: 8,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Task name"
        autoFocus
        style={{ fontSize: 14 }}
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        style={{ fontSize: 13 }}
      />
      <select
        value={skillId}
        onChange={e => setSkillId(e.target.value)}
        style={{
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          fontSize: 13,
        }}
      >
        <option value="">Select skill...</option>
        {areas.map(area => (
          <optgroup key={area.id} label={area.name}>
            {area.skills.map(skill => (
              <option key={skill.id} value={skill.id}>{skill.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'var(--accent)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            background: 'var(--bg-tertiary)',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
