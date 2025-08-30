import { Component, computed, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewNode } from '../../../shared/models/schema-models';
import { DynamicFormStateService } from '../../../services/dynamic-form-state.service';

@Component({
  selector: 'app-xs-tree-node',
  imports: [CommonModule],
  templateUrl: './xs-tree-node.component.html',
  styleUrl: './xs-tree-node.component.css'
})
export class XsTreeNodeComponent {
  @Input({ required: true }) node!: ViewNode;

  private form = inject(DynamicFormStateService);

  isChoice(): boolean { return (this.node?.kind || '').toLowerCase() === 'choice'; }

  /** id da opção escolhida (ou vazio) */
  selectedId = computed(() => this.form.getChoice(this.node.id) ?? '');

  /** seleciona uma opção (childId) */
  onChoose(childId: string) {
    this.form.setChoice(this.node.id, childId);
  }

  /** nó filho escolhido (ou null) */
  selectedChild = computed<ViewNode | null>(() => {
    const id = this.selectedId();
    if (!id) {
      // auto-seleciona quando houver apenas 1 opção
      if (this.isChoice() && this.node.children?.length === 1) {
        const only = this.node.children[0];
        this.form.setChoice(this.node.id, only.id);
        return only;
      }
      return null;
    }
    return (this.node.children || []).find(c => c.id === id) || null;
  });
}
