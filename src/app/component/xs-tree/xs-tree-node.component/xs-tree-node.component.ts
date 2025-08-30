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

  // ---- CHOICE ----
  isChoice(): boolean { return (this.node?.kind || '').toLowerCase() === 'choice'; }
  selectedChoiceId = computed(() => this.form.getChoice(this.node.id) ?? '');
  onChoose(childId: string) { this.form.setChoice(this.node.id, childId); }
  selectedChild = computed<ViewNode | null>(() => {
    const id = this.selectedChoiceId();
    if (!id) {
      if (this.isChoice() && this.node.children?.length === 1) {
        const only = this.node.children[0];
        this.form.setChoice(this.node.id, only.id);
        return only;
      }
      return null;
    }
    return (this.node.children || []).find(c => c.id === id) || null;
  });

  // ---- ENUMERATION ----
  // Um bloco "enumeration" com várias opções (cada filho é um valor)
  isEnumList(): boolean {
    return (this.node?.kind || '').toLowerCase() === 'enumeration' && !!this.node.children?.length;
  }
  selectedEnum = computed(() => this.form.getEnum(this.node.id) ?? '');
  onChooseEnum(val: string) { this.form.setEnum(this.node.id, val); }

  // rótulo "valor - primeira linha da doc"
  enumLabel(opt: ViewNode): string {
    const val = opt.name || '';
    const doc = (opt.meta?.docs && opt.meta.docs[0]) ? String(opt.meta.docs[0]).trim() : '';
    return doc ? `${val} - ${doc}` : val;
  }
}
