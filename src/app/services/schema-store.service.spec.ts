import { TestBed } from '@angular/core/testing';

import { SchemaStoreService } from './schema-store.service';

describe('SchemaStoreService', () => {
  let service: SchemaStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SchemaStoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
