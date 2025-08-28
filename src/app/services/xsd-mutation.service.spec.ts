import { TestBed } from '@angular/core/testing';

import { XsdMutationService } from './xsd-mutation.service';

describe('XsdMutationService', () => {
  let service: XsdMutationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XsdMutationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
