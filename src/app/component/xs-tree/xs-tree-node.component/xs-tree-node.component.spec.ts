import { ComponentFixture, TestBed } from '@angular/core/testing';

import { XsTreeNodeComponent } from './xs-tree-node.component';

describe('XsTreeNodeComponent', () => {
  let component: XsTreeNodeComponent;
  let fixture: ComponentFixture<XsTreeNodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [XsTreeNodeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(XsTreeNodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
