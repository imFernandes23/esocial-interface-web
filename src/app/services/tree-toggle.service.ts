import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ViewNode } from '../shared/models/schema-models';

export type TreeToggleCmd = 'open-all' | 'close-all';

@Injectable({
  providedIn: 'root'
})
export class TreeToggleService {
  private _open = new Set<string>();
  open$ = new BehaviorSubject<Set<string>>(this._open);

  isOpen(id: string){ return this._open.has(id); }

  toggle(id: string){
    this.isOpen(id) ? this._open.delete(id) : this._open.add(id);
    this.open$.next(new Set(this._open));
  }
  open(id: string){
    if (!this.isOpen(id)) { this._open.add(id); this.open$.next(new Set(this._open)); }
  }
  close(id: string){
    if (this.isOpen(id)) { this._open.delete(id); this.open$.next(new Set(this._open)); }
  }

  closeAll(){
    this._open.clear();
    this.open$.next(new Set(this._open));
  }

  /** abre todos os nós a partir da raiz */
  openAllFrom(root: ViewNode){
    const stack: ViewNode[] = [root];
    while (stack.length){
      const n = stack.pop()!;
      this._open.add(n.id);
      n.children?.forEach(c => stack.push(c));
    }
    this.open$.next(new Set(this._open));
  }
}
