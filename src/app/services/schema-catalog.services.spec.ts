import { TestBed } from '@angular/core/testing';

import { SchemaCatalogServices } from './schema-catalog.services';

describe('SchemaCatalogServices', () => {
  let service: SchemaCatalogServices;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SchemaCatalogServices);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
