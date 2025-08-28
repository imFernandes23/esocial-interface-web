import { TestBed } from '@angular/core/testing';

import { EditBufferService } from './edit-buffer.service';

describe('EditBufferService', () => {
  let service: EditBufferService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditBufferService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
