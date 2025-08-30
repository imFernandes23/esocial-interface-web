import { TestBed } from '@angular/core/testing';

import { SchemaTreeAdapterService } from './schema-tree-adapter.service';

describe('SchemaTreeAdapterService', () => {
  let service: SchemaTreeAdapterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SchemaTreeAdapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
