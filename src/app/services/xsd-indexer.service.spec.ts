import { TestBed } from '@angular/core/testing';

import { XsdIndexerService } from './xsd-indexer.service';

describe('XsdIndexerService', () => {
  let service: XsdIndexerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XsdIndexerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
