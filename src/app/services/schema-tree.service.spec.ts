import { TestBed } from '@angular/core/testing';

import { SchemaTreeService } from './schema-tree.service';

describe('SchemaTreeService', () => {
  let service: SchemaTreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SchemaTreeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
