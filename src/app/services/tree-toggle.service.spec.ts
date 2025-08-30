import { TestBed } from '@angular/core/testing';

import { TreeToggleService } from './tree-toggle.service';

describe('TreeToggleService', () => {
  let service: TreeToggleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TreeToggleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
