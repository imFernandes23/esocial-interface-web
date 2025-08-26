import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchemaNode } from './schema-node';

describe('SchemaNode', () => {
  let component: SchemaNode;
  let fixture: ComponentFixture<SchemaNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaNode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchemaNode);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
