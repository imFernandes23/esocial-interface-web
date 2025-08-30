import { TestBed } from '@angular/core/testing';

import { DynamicFormStateService } from './dynamic-form-state.service';

describe('DynamicFormStateServiceService', () => {
  let service: DynamicFormStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DynamicFormStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
