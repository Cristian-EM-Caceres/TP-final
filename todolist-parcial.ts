import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import * as path from 'path';

/* Estado de una tarea */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CANCELLED = 'cancelled'
}

/** Dificultad de una tarea */
export enum TaskDifficulty {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/** Representa una tarea en el sistema */
export interface ITask {
  id: string; // uuid
  title: string;
  description?: string;
  createdAt: string; // ISO
  dueDate?: string; // ISO
  difficulty: TaskDifficulty;
  priority: number; // 1..5 (5 = más alta)
  status: TaskStatus;
  tags?: string[];
  relatedIds?: string[]; // relaciones a otras tareas
  deleted?: boolean; // soft delete flag
}

export class Task implements ITask {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  dueDate?: string;
  difficulty: TaskDifficulty;
  priority: number;
  status: TaskStatus;
  tags?: string[];
  relatedIds?: string[];
  deleted?: boolean;

  constructor(payload: Partial<ITask> & { title: string }) {
    // Validaciones (estructurada)
    if (!payload.title || typeof payload.title !== 'string') {
      throw new Error('Task must have a non-empty title');
    }

    this.id = payload.id ?? uuidv4();
    this.title = payload.title;
    this.description = payload.description;
    this.createdAt = payload.createdAt ?? new Date().toISOString();
    this.dueDate = payload.dueDate;
    this.difficulty = payload.difficulty ?? TaskDifficulty.MEDIUM;
    this.priority = typeof payload.priority === 'number' ? payload.priority : 3;
    this.status = payload.status ?? TaskStatus.TODO;
    this.tags = payload.tags ?? [];
    this.relatedIds = payload.relatedIds ?? [];
    this.deleted = payload.deleted ?? false;
  }

  /** Marca la tarea como completada */
  complete() {
    this.status = TaskStatus.DONE;
  }

  /** Marca la tarea como borrada (soft delete) */
  softDelete() {
    this.deleted = true;
  }

  /** Restaura una tarea previamente borrada */
  restore() {
    this.deleted = false;
  }
}
export class TaskRepository {
  private filePath: string;

  constructor(filename = 'tareas.json') {
    // ruta absoluta dentro del proyecto
    this.filePath = path.resolve(process.cwd(), filename);
  }

  /** Lee todas las tareas desde el archivo  */
  async readAll(): Promise<ITask[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data) as ITask[];
      // validacion mínima
      return parsed.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string');
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /* Escribe el arreglo de tareas al archivo */
  async writeAll(tasks: ITask[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(tasks, null, 2), 'utf-8');
  }
}

// Utilidades Funcionales (Programación Funcional) /**

/** Retorna true si la tarea esta vencida */
export const isOverdue = (nowIso: string) => (t: ITask): boolean => {
  if (!t.dueDate) return false;
  return new Date(t.dueDate).getTime() < new Date(nowIso).getTime();
};

/** Predicado: prioridad alta (>=4) */
export const isHighPriority = (t: ITask): boolean => t.priority >= 4 && !t.deleted;

/** Predicado: no borrada */
export const isNotDeleted = (t: ITask): boolean => !t.deleted;

/** Ordenadores puros: devuelven nuevo array ordenado */
export const sortByTitle = (tasks: ITask[]): ITask[] => [...tasks].sort((a, b) => a.title.localeCompare(b.title));
export const sortByCreation = (tasks: ITask[]): ITask[] =>
  [...tasks].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
export const sortByDueDate = (tasks: ITask[]): ITask[] =>
  [...tasks].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });
export const sortByDifficulty = (tasks: ITask[]): ITask[] =>
  [...tasks].sort((a, b) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty));

const difficultyRank = (d: TaskDifficulty): number => {
  switch (d) {
    case TaskDifficulty.LOW:
      return 1;
    case TaskDifficulty.MEDIUM:
      return 2;
    case TaskDifficulty.HIGH:
      return 3;
    default:
      return 2;
  }
};

/** Estadísticas puras */
export const statsTotal = (tasks: ITask[]): number => tasks.filter(isNotDeleted).length;
export const statsByStatus = (tasks: ITask[]) =>
  tasks
    .filter(isNotDeleted)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

export const statsByDifficulty = (tasks: ITask[]) =>
  tasks
    .filter(isNotDeleted)
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.difficulty] = (acc[t.difficulty] || 0) + 1;
      return acc;
    }, {});
export const predicate = {
  highPriority: isHighPriority,
  overdue: (nowIso: string) => isOverdue(nowIso),
  hasTag: (tag: string) => (t: ITask) => !!t.tags && t.tags.includes(tag),
  relatedTo: (id: string) => (t: ITask) => !!t.relatedIds && t.relatedIds.includes(id),
};
export class TaskManager {
  private repo: TaskRepository;
  private cache: ITask[] | null = null; // cache en memoria para operaciones rápidas

  constructor(repo?: TaskRepository) {
    this.repo = repo ?? new TaskRepository();
  }

  /** Carga tareas desde repo a cache */
  private async loadIfNeeded() {
    if (this.cache === null) {
      this.cache = await this.repo.readAll();
    }
  }

  /** Forzar recarga */
  async reload() {
    this.cache = await this.repo.readAll();
  }

  /** Añade una nueva tarea y persiste */
  async add(taskPayload: Partial<ITask> & { title: string }): Promise<ITask> {
    await this.loadIfNeeded();
    const t = new Task(taskPayload);
    this.cache!.push(t);
    await this.repo.writeAll(this.cache!);
    return t;
  }

  /** Encuentra tarea por id */
  async findById(id: string): Promise<ITask | undefined> {
    await this.loadIfNeeded();
    return this.cache!.find((t) => t.id === id);
  }

  /** Actualiza una tarea (parcial) */
  async update(id: string, changes: Partial<ITask>): Promise<ITask | undefined> {
    await this.loadIfNeeded();
    const idx = this.cache!.findIndex((t) => t.id === id);
    if (idx === -1) return undefined;
    const current = this.cache![idx];
    const updated: ITask = { ...current, ...changes, id: current.id };
    this.cache![idx] = updated;
    await this.repo.writeAll(this.cache!);
    return updated;
  }

  /** Soft delete: marca como deleted = true y persiste */
  async softDelete(id: string): Promise<boolean> {
    await this.loadIfNeeded();
    const t = this.cache!.find((x) => x.id === id);
    if (!t) return false;
    t.deleted = true;
    await this.repo.writeAll(this.cache!);
    return true;
  }

  /** Hard delete: elimina fisicamente la entrada y persiste */
  async hardDelete(id: string): Promise<boolean> {
    await this.loadIfNeeded();
    const prevLen = this.cache!.length;
    this.cache = this.cache!.filter((x) => x.id !== id);
    await this.repo.writeAll(this.cache!);
    return this.cache!.length < prevLen;
  }

  /** Listado con filtros */
  async list(options?: { includeDeleted?: boolean; sortBy?: 'title' | 'createdAt' | 'dueDate' | 'difficulty' }) {
    await this.loadIfNeeded();
    let result = this.cache!;
    if (!options?.includeDeleted) result = result.filter(isNotDeleted);

    switch (options?.sortBy) {
      case 'title':
        result = sortByTitle(result);
        break;
      case 'createdAt':
        result = sortByCreation(result);
        break;
      case 'dueDate':
        result = sortByDueDate(result);
        break;
      case 'difficulty':
        result = sortByDifficulty(result);
        break;
    }

    return result;
  }

  /** Estadisticas: delega a funciones puras */
  async statistics() {
    await this.loadIfNeeded();
    const all = this.cache!;
    return {
      total: statsTotal(all),
      byStatus: statsByStatus(all),
      byDifficulty: statsByDifficulty(all),
    };
  }

  /** Consultas / inferencias (ejemplos) */
  async highPriority(nowIso?: string) {
    await this.loadIfNeeded();
    return this.cache!.filter((t) => isHighPriority(t));
  }

  async overdue(nowIso?: string) {
    await this.loadIfNeeded();
    const now = nowIso ?? new Date().toISOString();
    return this.cache!.filter(predicate.overdue(now)).filter(isNotDeleted);
  }

  async relatedTasks(taskId: string) {
    await this.loadIfNeeded();
    return this.cache!.filter(predicate.relatedTo(taskId));
  }
}
export async function exampleFlow() {
  const repo = new TaskRepository('data/tareas.json');
  const manager = new TaskManager(repo);

  // Añadir tarea 
  try {
    const t = await manager.add({ title: 'Preparar presentación', dueDate: new Date(Date.now() + 86400000).toISOString(), difficulty: TaskDifficulty.HIGH, priority: 5, tags: ['universidad', 'parcial'] });
    console.log('Tarea creada:', t.id);
  } catch (err) {
    console.error('Error creando tarea:', err);
  }

  // Listar tasks ordenadas por vencimiento
  const tasks = await manager.list({ sortBy: 'dueDate' });
  console.log('Tareas:', tasks.map((x) => ({ id: x.id, title: x.title, due: x.dueDate })));

  // Estadísticas
  const stats = await manager.statistics();
  console.log('Estadísticas:', stats);
}


export default {
  Task,
  TaskManager,
  TaskRepository,
  predicate,
  // utilidades puras exportadas
  sortByTitle,
  sortByCreation,
  sortByDueDate,
  sortByDifficulty,
};
