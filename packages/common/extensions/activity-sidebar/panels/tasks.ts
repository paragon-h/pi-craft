/**
 * Tasks Panel — shows todo tasks from the current session.
 *
 * Sources data from shared/session.ts's reconstructTodoState().
 * Each task becomes a PanelItem with a status icon and title.
 */

import type { Task } from "../../../shared/types";
import type { PanelItem, SidebarPanel } from "../types";

export class TasksPanel implements SidebarPanel {
  id = "tasks";
  title = "任务";

  private tasks: Task[] = [];

  /** Update the task list (called by the extension on tool events). */
  update(tasks: Task[]): void {
    this.tasks = tasks;
  }

  getItems(): PanelItem[] {
    return this.tasks.map((t, i) => ({
      id: `task-${i}`,
      icon: this.statusIcon(t.status),
      label: `#${t.id} ${t.title}`,
      action: undefined, // Phase 4: could toggle task status
    }));
  }

  onAction?(_item: PanelItem): void {
    // Phase 4: could start/done a task
  }

  private statusIcon(status: Task["status"]): string {
    switch (status) {
      case "in_progress":
        return "🔄";
      case "done":
        return "✅";
      case "cancelled":
        return "❌";
      default:
        return "⬜";
    }
  }
}
